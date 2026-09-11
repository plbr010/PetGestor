-- PetGestor BLOCO 4 — pacotes: pagamento, saldo, consumo, idempotência, cancelamento e expiração.
-- Incremental e não destrutiva. NÃO reaplica BLOCO 1, 2 ou 3.
-- Preserva p_company_id, membership ativa, permissões, RLS e fail-closed.
--
-- expires_at é INCLUSIVO: o pacote vale até o dia civil da empresa (companies.timezone).
-- Condição de expiração: expires_at < hoje civil da empresa.

-- ---------------------------------------------------------------------------
-- 1. Colunas e constraints (sem apagar dados)
-- ---------------------------------------------------------------------------

ALTER TABLE public.customer_service_packages
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

-- Legado: chaves sintéticas só para permitir UNIQUE NOT NULL. Não reutilizáveis pelo cliente.
UPDATE public.customer_service_packages
SET idempotency_key = gen_random_uuid()
WHERE idempotency_key IS NULL;

ALTER TABLE public.customer_service_packages
  ALTER COLUMN idempotency_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_service_packages_company_idempotency_key'
  ) THEN
    ALTER TABLE public.customer_service_packages
      ADD CONSTRAINT customer_service_packages_company_idempotency_key
      UNIQUE (company_id, idempotency_key);
  END IF;
END
$$;

COMMENT ON COLUMN public.customer_service_packages.idempotency_key IS
  'Chave de idempotência da tentativa de venda. UNIQUE por empresa. Retry da mesma tentativa devolve o pacote original.';

COMMENT ON COLUMN public.customer_service_packages.expires_at IS
  'Último dia civil inclusive de validade no fuso da empresa. Expirado quando expires_at < hoje civil.';

COMMENT ON COLUMN public.customer_service_packages.financial_entry_id IS
  'Vínculo canônico com a receita da venda (financial_entries.id). Uma venda = uma origem financeira.';

COMMENT ON COLUMN public.customer_service_packages.status IS
  'Status operacional: active | expired | fully_used | cancelled. Pagamento vive em financial_entries.status.';

-- Unicidade do vínculo pacote → receita, se o legado permitir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.customer_service_packages
    WHERE financial_entry_id IS NOT NULL
    GROUP BY company_id, financial_entry_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'BLOCO 4: duplicidade legado em customer_service_packages.financial_entry_id — índice único não criado. Ver docs/sql/diagnose-bloco-4-packages.sql';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'customer_service_packages_financial_entry_uidx'
  ) THEN
    CREATE UNIQUE INDEX customer_service_packages_financial_entry_uidx
      ON public.customer_service_packages (company_id, financial_entry_id)
      WHERE financial_entry_id IS NOT NULL;
  END IF;
END
$$;

-- Consumo idempotente por appointment (já existe na 20260902160000; reforço).
CREATE UNIQUE INDEX IF NOT EXISTS customer_service_package_usages_appointment_consumed_uidx
  ON public.customer_service_package_usages (company_id, appointment_id)
  WHERE status = 'consumed';

-- ---------------------------------------------------------------------------
-- 2. Data civil da empresa (nunca now() UTC como data comercial)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.company_civil_today(p_company_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_timezone text;
BEGIN
  SELECT c.timezone INTO v_timezone
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF v_timezone IS NULL OR btrim(v_timezone) = '' THEN
    v_timezone := 'America/Sao_Paulo';
  END IF;

  RETURN (timezone(v_timezone, now()))::date;
END;
$$;

REVOKE ALL ON FUNCTION private.company_civil_today(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.customer_package_financial_status(
  p_company_id uuid,
  p_customer_package_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT fe.status
  INTO v_status
  FROM public.financial_entries fe
  WHERE fe.company_id = p_company_id
    AND fe.customer_service_package_id = p_customer_package_id
    AND fe.source_type = 'service_package'
    AND fe.deleted_at IS NULL
  ORDER BY fe.created_at ASC
  LIMIT 1;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION private.customer_package_financial_status(uuid, uuid) FROM PUBLIC;

-- Recalcula status operacional. Não promove pacote não pago a crédito.
CREATE OR REPLACE FUNCTION private.refresh_customer_service_package_status(
  p_customer_package_id uuid,
  p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_pkg record;
  v_remaining integer;
  v_today date;
BEGIN
  SELECT csp.id, csp.status, csp.expires_at
  INTO v_pkg
  FROM public.customer_service_packages csp
  WHERE csp.id = p_customer_package_id
    AND csp.company_id = p_company_id
  FOR UPDATE;

  IF v_pkg.id IS NULL OR v_pkg.status = 'cancelled' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(cspi.quantity_total - cspi.quantity_used), 0)
  INTO v_remaining
  FROM public.customer_service_package_items cspi
  WHERE cspi.customer_package_id = p_customer_package_id
    AND cspi.company_id = p_company_id;

  IF v_remaining <= 0 THEN
    UPDATE public.customer_service_packages
    SET status = 'fully_used'
    WHERE id = p_customer_package_id
      AND company_id = p_company_id
      AND status IS DISTINCT FROM 'fully_used';
    RETURN;
  END IF;

  v_today := private.company_civil_today(p_company_id);

  IF v_pkg.expires_at < v_today THEN
    UPDATE public.customer_service_packages
    SET status = 'expired'
    WHERE id = p_customer_package_id
      AND company_id = p_company_id
      AND status IS DISTINCT FROM 'expired';
    RETURN;
  END IF;

  UPDATE public.customer_service_packages
  SET status = 'active'
  WHERE id = p_customer_package_id
    AND company_id = p_company_id
    AND status IS DISTINCT FROM 'active'
    AND status <> 'cancelled';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Consumo: somente pago + ativo + não expirado + saldo > 0
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.consume_package_for_appointment(
  p_company_id uuid,
  p_appointment_id uuid,
  p_customer_package_id uuid,
  p_service_order_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_today date;
  v_appointment record;
  v_pkg record;
  v_financial_status text;
  v_balance record;
  v_usage record;
  v_usage_id uuid;
  v_original_price integer;
  v_updated_id uuid;
BEGIN
  IF p_customer_package_id IS NULL THEN
    RAISE EXCEPTION 'customer_package_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_today := private.company_civil_today(p_company_id);

  SELECT a.id, a.pet_id, a.service_id, a.price_cents_snapshot, a.customer_package_id
  INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.company_id = p_company_id
    AND a.deleted_at IS NULL
  FOR UPDATE;

  IF v_appointment.id IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT u.id, u.customer_package_id, u.service_order_id
  INTO v_usage
  FROM public.customer_service_package_usages u
  WHERE u.appointment_id = p_appointment_id
    AND u.company_id = p_company_id
    AND u.status = 'consumed'
  FOR UPDATE;

  IF v_usage.id IS NOT NULL THEN
    IF v_usage.customer_package_id IS DISTINCT FROM p_customer_package_id THEN
      RAISE EXCEPTION 'package_already_consumed' USING ERRCODE = '22023';
    END IF;

    IF p_service_order_id IS NOT NULL THEN
      IF v_usage.service_order_id IS NULL THEN
        UPDATE public.customer_service_package_usages
        SET service_order_id = p_service_order_id
        WHERE id = v_usage.id AND company_id = p_company_id;
      ELSIF v_usage.service_order_id IS DISTINCT FROM p_service_order_id THEN
        RAISE EXCEPTION 'package_already_consumed' USING ERRCODE = '22023';
      END IF;
    END IF;

    UPDATE public.appointments
    SET
      price_cents_snapshot = 0,
      customer_package_id = p_customer_package_id
    WHERE id = p_appointment_id AND company_id = p_company_id;

    RETURN v_usage.id;
  END IF;

  IF v_appointment.price_cents_snapshot = 0 THEN
    RAISE EXCEPTION 'appointment_already_covered' USING ERRCODE = '22023';
  END IF;

  SELECT csp.id, csp.status, csp.expires_at, csp.starts_at, csp.pet_id
  INTO v_pkg
  FROM public.customer_service_packages csp
  WHERE csp.id = p_customer_package_id
    AND csp.company_id = p_company_id
  FOR UPDATE;

  IF v_pkg.id IS NULL THEN
    RAISE EXCEPTION 'customer_package_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_pkg.pet_id <> v_appointment.pet_id THEN
    RAISE EXCEPTION 'package_pet_mismatch' USING ERRCODE = '22023';
  END IF;

  v_financial_status := private.customer_package_financial_status(p_company_id, p_customer_package_id);

  IF v_financial_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'package_payment_pending' USING ERRCODE = '22023';
  END IF;

  IF v_pkg.status = 'cancelled' THEN
    RAISE EXCEPTION 'package_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_pkg.status = 'fully_used' THEN
    RAISE EXCEPTION 'package_balance_unavailable' USING ERRCODE = '22023';
  END IF;

  IF v_pkg.starts_at > v_today THEN
    RAISE EXCEPTION 'package_not_started' USING ERRCODE = '22023';
  END IF;

  -- expires_at inclusivo: válido no próprio dia civil; expirado somente se < hoje.
  IF v_pkg.expires_at < v_today OR v_pkg.status = 'expired' THEN
    PERFORM private.refresh_customer_service_package_status(p_customer_package_id, p_company_id);
    RAISE EXCEPTION 'package_expired' USING ERRCODE = '22023';
  END IF;

  IF v_pkg.status <> 'active' THEN
    RAISE EXCEPTION 'package_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT cspi.id, cspi.quantity_total, cspi.quantity_used
  INTO v_balance
  FROM public.customer_service_package_items cspi
  WHERE cspi.customer_package_id = p_customer_package_id
    AND cspi.company_id = p_company_id
    AND cspi.service_id = v_appointment.service_id
    AND cspi.quantity_used < cspi.quantity_total
  FOR UPDATE;

  IF v_balance.id IS NULL THEN
    RAISE EXCEPTION 'package_balance_unavailable' USING ERRCODE = '22023';
  END IF;

  v_original_price := v_appointment.price_cents_snapshot;

  UPDATE public.customer_service_package_items
  SET quantity_used = quantity_used + 1
  WHERE id = v_balance.id
    AND company_id = p_company_id
    AND quantity_used < quantity_total
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'package_balance_unavailable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointments
  SET
    price_cents_snapshot = 0,
    customer_package_id = p_customer_package_id
  WHERE id = v_appointment.id AND company_id = p_company_id;

  BEGIN
    INSERT INTO public.customer_service_package_usages (
      company_id,
      customer_package_id,
      customer_package_item_id,
      service_id,
      appointment_id,
      service_order_id,
      quantity,
      status,
      original_price_cents_snapshot
    ) VALUES (
      p_company_id,
      p_customer_package_id,
      v_balance.id,
      v_appointment.service_id,
      v_appointment.id,
      p_service_order_id,
      1,
      'consumed',
      v_original_price
    )
    RETURNING id INTO v_usage_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT u.id
      INTO v_usage_id
      FROM public.customer_service_package_usages u
      WHERE u.appointment_id = p_appointment_id
        AND u.company_id = p_company_id
        AND u.status = 'consumed';

      IF v_usage_id IS NULL THEN
        RAISE;
      END IF;

      UPDATE public.customer_service_package_items
      SET quantity_used = quantity_used - 1
      WHERE id = v_balance.id
        AND company_id = p_company_id
        AND quantity_used > 0;

      RETURN v_usage_id;
  END;

  PERFORM private.refresh_customer_service_package_status(p_customer_package_id, p_company_id);

  RETURN v_usage_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.reverse_package_usage_for_appointment(
  p_company_id uuid,
  p_appointment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_usage record;
  v_updated_id uuid;
BEGIN
  SELECT u.id, u.customer_package_id, u.customer_package_item_id,
         u.original_price_cents_snapshot
  INTO v_usage
  FROM public.customer_service_package_usages u
  WHERE u.appointment_id = p_appointment_id
    AND u.company_id = p_company_id
    AND u.status = 'consumed'
  FOR UPDATE;

  IF v_usage.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.customer_service_package_items
  SET quantity_used = quantity_used - 1
  WHERE id = v_usage.customer_package_item_id
    AND company_id = p_company_id
    AND quantity_used > 0
  RETURNING id INTO v_updated_id;

  UPDATE public.appointments
  SET price_cents_snapshot = v_usage.original_price_cents_snapshot
  WHERE id = p_appointment_id AND company_id = p_company_id;

  UPDATE public.customer_service_package_usages
  SET status = 'reversed', reversed_at = now()
  WHERE id = v_usage.id
    AND company_id = p_company_id
    AND status = 'consumed';

  PERFORM private.refresh_customer_service_package_status(v_usage.customer_package_id, p_company_id);

  RETURN v_usage.id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Venda transacional, preço do catálogo, idempotência
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.sell_customer_service_package(uuid, uuid, uuid, date, text, text, uuid);
DROP FUNCTION IF EXISTS public.sell_customer_service_package(uuid, uuid, uuid, date, text, text);
DROP FUNCTION IF EXISTS private.sell_customer_service_package(uuid, uuid, uuid, date, text, text);

CREATE FUNCTION private.sell_customer_service_package(
  p_package_id uuid,
  p_customer_id uuid,
  p_pet_id uuid,
  p_starts_at date,
  p_financial_status text,
  p_payment_method text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_package record;
  v_existing record;
  v_customer_package_id uuid;
  v_financial_entry_id uuid;
  v_expires_at date;
  v_item record;
  v_item_count integer := 0;
  v_due_date date;
  v_description text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  IF p_starts_at IS NULL THEN
    RAISE EXCEPTION 'invalid_starts_at' USING ERRCODE = '22023';
  END IF;

  IF p_financial_status NOT IN ('pending', 'paid') THEN
    RAISE EXCEPTION 'invalid_financial_status' USING ERRCODE = '22023';
  END IF;

  IF p_financial_status = 'paid' AND p_payment_method IS NULL THEN
    RAISE EXCEPTION 'payment_method_required' USING ERRCODE = '22023';
  END IF;

  SELECT csp.id, csp.package_id, csp.customer_id, csp.pet_id
  INTO v_existing
  FROM public.customer_service_packages csp
  WHERE csp.company_id = v_company_id
    AND csp.idempotency_key = p_idempotency_key;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.package_id IS DISTINCT FROM p_package_id
      OR v_existing.customer_id IS DISTINCT FROM p_customer_id
      OR v_existing.pet_id IS DISTINCT FROM p_pet_id
    THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
    END IF;

    RETURN v_existing.id;
  END IF;

  SELECT sp.id, sp.name, sp.price_cents, sp.validity_days
  INTO v_package
  FROM public.service_packages sp
  WHERE sp.id = p_package_id
    AND sp.company_id = v_company_id
    AND sp.deleted_at IS NULL
    AND sp.active = true
  FOR SHARE;

  IF v_package.id IS NULL THEN
    RAISE EXCEPTION 'package_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Preço somente do catálogo no servidor. Zero não é venda válida.
  IF v_package.price_cents IS NULL OR v_package.price_cents <= 0 OR v_package.price_cents > 99999999 THEN
    RAISE EXCEPTION 'invalid_price_cents' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pets p
    WHERE p.id = p_pet_id
      AND p.customer_id = p_customer_id
      AND p.company_id = v_company_id
      AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'pet_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_item_count
  FROM public.service_package_items spi
  WHERE spi.package_id = p_package_id
    AND spi.company_id = v_company_id;

  IF v_item_count < 1 THEN
    RAISE EXCEPTION 'invalid_package_items' USING ERRCODE = '22023';
  END IF;

  v_expires_at := p_starts_at + (v_package.validity_days - 1);

  BEGIN
    INSERT INTO public.customer_service_packages (
      company_id,
      customer_id,
      pet_id,
      package_id,
      package_name_snapshot,
      purchased_at,
      starts_at,
      expires_at,
      status,
      price_cents_snapshot,
      created_by,
      idempotency_key
    ) VALUES (
      v_company_id,
      p_customer_id,
      p_pet_id,
      p_package_id,
      v_package.name,
      now(),
      p_starts_at,
      v_expires_at,
      'active',
      v_package.price_cents,
      v_user_id,
      p_idempotency_key
    )
    RETURNING id INTO v_customer_package_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT csp.id, csp.package_id, csp.customer_id, csp.pet_id
      INTO v_existing
      FROM public.customer_service_packages csp
      WHERE csp.company_id = v_company_id
        AND csp.idempotency_key = p_idempotency_key;

      IF v_existing.id IS NULL THEN
        RAISE;
      END IF;

      IF v_existing.package_id IS DISTINCT FROM p_package_id
        OR v_existing.customer_id IS DISTINCT FROM p_customer_id
        OR v_existing.pet_id IS DISTINCT FROM p_pet_id
      THEN
        RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
      END IF;

      RETURN v_existing.id;
  END;

  FOR v_item IN
    SELECT spi.service_id, spi.quantity, s.name AS service_name
    FROM public.service_package_items spi
    INNER JOIN public.services s
      ON s.id = spi.service_id
      AND s.company_id = spi.company_id
    WHERE spi.package_id = p_package_id
      AND spi.company_id = v_company_id
  LOOP
    INSERT INTO public.customer_service_package_items (
      company_id,
      customer_package_id,
      service_id,
      service_name_snapshot,
      quantity_total,
      quantity_used
    ) VALUES (
      v_company_id,
      v_customer_package_id,
      v_item.service_id,
      v_item.service_name,
      v_item.quantity,
      0
    );
  END LOOP;

  v_description := left('Pacote · ' || v_package.name, 160);
  v_due_date := p_starts_at;

  INSERT INTO public.financial_entries (
    company_id,
    entry_type,
    status,
    source_type,
    customer_service_package_id,
    description,
    category,
    amount_cents,
    due_date,
    payment_method,
    paid_at,
    created_by
  ) VALUES (
    v_company_id,
    'income',
    p_financial_status,
    'service_package',
    v_customer_package_id,
    v_description,
    'Pacotes',
    v_package.price_cents,
    v_due_date,
    CASE WHEN p_financial_status = 'paid' THEN p_payment_method ELSE NULL END,
    CASE WHEN p_financial_status = 'paid' THEN now() ELSE NULL END,
    v_user_id
  )
  RETURNING id INTO v_financial_entry_id;

  UPDATE public.customer_service_packages
  SET financial_entry_id = v_financial_entry_id
  WHERE id = v_customer_package_id AND company_id = v_company_id;

  PERFORM private.refresh_customer_service_package_status(v_customer_package_id, v_company_id);

  RETURN v_customer_package_id;
END;
$$;

REVOKE ALL ON FUNCTION private.sell_customer_service_package(uuid, uuid, uuid, date, text, text, uuid) FROM PUBLIC;

CREATE FUNCTION public.sell_customer_service_package(
  p_package_id uuid,
  p_customer_id uuid,
  p_pet_id uuid,
  p_starts_at date,
  p_financial_status text DEFAULT 'pending',
  p_payment_method text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'finance.create');
  RETURN private.sell_customer_service_package(
    p_package_id,
    p_customer_id,
    p_pet_id,
    p_starts_at,
    p_financial_status,
    p_payment_method,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sell_customer_service_package(
  uuid, uuid, uuid, date, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sell_customer_service_package(
  uuid, uuid, uuid, date, text, text, uuid, uuid
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cancelamento: pending reconcilia financeiro; paid bloqueia sem refund
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cancel_customer_service_package(
  p_customer_package_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_pkg record;
  v_financial_status text;
  v_consumed integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT csp.id, csp.status, csp.financial_entry_id
  INTO v_pkg
  FROM public.customer_service_packages csp
  WHERE csp.id = p_customer_package_id
    AND csp.company_id = v_company_id
  FOR UPDATE;

  IF v_pkg.id IS NULL THEN
    RAISE EXCEPTION 'customer_package_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_consumed
  FROM public.customer_service_package_usages u
  WHERE u.customer_package_id = p_customer_package_id
    AND u.company_id = v_company_id
    AND u.status = 'consumed';

  v_financial_status := private.customer_package_financial_status(v_company_id, p_customer_package_id);

  IF v_pkg.status = 'cancelled' THEN
    IF v_financial_status = 'pending' THEN
      UPDATE public.financial_entries
      SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, now())
      WHERE company_id = v_company_id
        AND customer_service_package_id = p_customer_package_id
        AND source_type = 'service_package'
        AND status = 'pending'
        AND deleted_at IS NULL;
    END IF;

    RETURN p_customer_package_id;
  END IF;

  IF v_consumed > 0 THEN
    RAISE EXCEPTION 'package_has_usages' USING ERRCODE = '22023';
  END IF;

  IF v_financial_status = 'paid' THEN
    RAISE EXCEPTION 'package_paid_requires_refund' USING ERRCODE = '22023';
  END IF;

  UPDATE public.customer_service_packages
  SET status = 'cancelled'
  WHERE id = p_customer_package_id AND company_id = v_company_id;

  UPDATE public.financial_entries
  SET status = 'cancelled', cancelled_at = now()
  WHERE company_id = v_company_id
    AND customer_service_package_id = p_customer_package_id
    AND source_type = 'service_package'
    AND status = 'pending'
    AND deleted_at IS NULL;

  RETURN p_customer_package_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Pagamento da receita do pacote ativa o MESMO pacote (sem recriar saldo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.mark_financial_entry_paid(
  p_entry_id uuid,
  p_payment_method text,
  p_paid_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_entry record;
  v_pkg record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN (
    'cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  SELECT fe.id, fe.status, fe.source_type, fe.customer_service_package_id, fe.amount_cents
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = v_company_id
    AND fe.deleted_at IS NULL
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.status = 'paid'
    AND v_entry.source_type = 'service_package'
    AND v_entry.customer_service_package_id IS NOT NULL
  THEN
    PERFORM private.refresh_customer_service_package_status(
      v_entry.customer_service_package_id,
      v_company_id
    );
    RETURN p_entry_id;
  END IF;

  IF v_entry.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  IF v_entry.source_type = 'service_package' AND v_entry.customer_service_package_id IS NOT NULL THEN
    SELECT csp.id, csp.price_cents_snapshot, csp.status
    INTO v_pkg
    FROM public.customer_service_packages csp
    WHERE csp.id = v_entry.customer_service_package_id
      AND csp.company_id = v_company_id
    FOR UPDATE;

    IF v_pkg.id IS NULL THEN
      RAISE EXCEPTION 'customer_package_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_entry.amount_cents IS DISTINCT FROM v_pkg.price_cents_snapshot THEN
      RAISE EXCEPTION 'package_price_mismatch' USING ERRCODE = '22023';
    END IF;

    IF v_pkg.price_cents_snapshot IS NULL OR v_pkg.price_cents_snapshot <= 0 THEN
      RAISE EXCEPTION 'invalid_price_cents' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.financial_entries
  SET
    status = 'paid',
    payment_method = p_payment_method,
    paid_at = COALESCE(p_paid_at, now())
  WHERE id = p_entry_id AND company_id = v_company_id;

  IF v_entry.source_type = 'service_package' AND v_entry.customer_service_package_id IS NOT NULL THEN
    PERFORM private.refresh_customer_service_package_status(
      v_entry.customer_service_package_id,
      v_company_id
    );
  END IF;

  RETURN p_entry_id;
END;
$$;
