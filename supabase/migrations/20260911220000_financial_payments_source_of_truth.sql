-- PetGestor BLOCO 5 — fonte de verdade financeira, pagamentos parciais/mistos,
-- recebíveis líquidos, reabertura coerente, concorrência e idempotência.
-- Incremental. Não edita migrations dos BLOCOs 1–4.
-- Não reseta banco, não apaga pagamentos, não desabilita RLS.

-- ---------------------------------------------------------------------------
-- 1. Fonte de verdade
--    financial_entries.amount_cents = valor faturado
--    SUM(financial_payments.amount_cents WHERE cancelled_at IS NULL) = recebido
--    remaining = amount - recebido
--    financial_entries.payment_method = compatibilidade (último pagamento quando
--    paid; NULL em partially_paid). Métodos reais vivem em financial_payments.
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.financial_entries.amount_cents IS
  'Valor faturado do lançamento (centavos). Não é o valor recebido.';

COMMENT ON COLUMN public.financial_entries.payment_method IS
  'Compatibilidade: último pagamento ativo quando status=paid; NULL em partially_paid. Não usar sozinho para listar todos os métodos — consultar financial_payments.';

COMMENT ON COLUMN public.financial_entries.paid_at IS
  'Instante (timestamptz UTC) do último pagamento ativo quando status=paid. Filtros por dia usam o fuso da empresa convertido para UTC.';

COMMENT ON COLUMN public.financial_entries.due_date IS
  'Data civil (date). Não interpretar como instante UTC.';

COMMENT ON TABLE public.financial_payments IS
  'Fonte de verdade do dinheiro recebido. Nunca DELETE físico; use cancelled_at.';

CREATE INDEX IF NOT EXISTS idx_financial_payments_company_method
  ON public.financial_payments (company_id, payment_method)
  WHERE cancelled_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Helpers compartilhados (mesma matemática para Financeiro, dashboard, overview)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.sum_active_financial_payments(p_entry_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT coalesce(sum(fp.amount_cents), 0)::integer
  FROM public.financial_payments fp
  INNER JOIN public.financial_entries fe
    ON fe.id = fp.financial_entry_id
   AND fe.company_id = fp.company_id
  WHERE fp.financial_entry_id = p_entry_id
    AND fp.cancelled_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION private.financial_entry_received_cents(
  p_entry_id uuid,
  p_amount_cents integer,
  p_status text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_paid integer;
BEGIN
  IF p_status = 'cancelled' THEN
    RETURN 0;
  END IF;

  v_paid := private.sum_active_financial_payments(p_entry_id);

  IF v_paid > 0 THEN
    RETURN v_paid;
  END IF;

  -- Legado: paid sem parcela não inventa linha; conta o amount integral.
  IF p_status = 'paid' THEN
    RETURN p_amount_cents;
  END IF;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION private.financial_entry_remaining_cents(
  p_entry_id uuid,
  p_amount_cents integer,
  p_status text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT GREATEST(
    0,
    p_amount_cents - private.financial_entry_received_cents(p_entry_id, p_amount_cents, p_status)
  );
$$;

CREATE OR REPLACE FUNCTION private.sync_financial_entry_payment_status(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_entry record;
  v_paid integer;
  v_last record;
BEGIN
  SELECT fe.id, fe.amount_cents, fe.status, fe.company_id
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id AND fe.deleted_at IS NULL;

  IF v_entry.id IS NULL OR v_entry.status = 'cancelled' THEN
    RETURN;
  END IF;

  v_paid := private.sum_active_financial_payments(p_entry_id);

  SELECT fp.payment_method, fp.paid_at
  INTO v_last
  FROM public.financial_payments fp
  WHERE fp.financial_entry_id = p_entry_id
    AND fp.company_id = v_entry.company_id
    AND fp.cancelled_at IS NULL
  ORDER BY fp.paid_at DESC, fp.created_at DESC
  LIMIT 1;

  IF v_paid <= 0 THEN
    UPDATE public.financial_entries
    SET status = 'pending', payment_method = NULL, paid_at = NULL
    WHERE id = p_entry_id
      AND company_id = v_entry.company_id
      AND status <> 'cancelled';
  ELSIF v_paid >= v_entry.amount_cents THEN
    UPDATE public.financial_entries
    SET
      status = 'paid',
      payment_method = v_last.payment_method,
      paid_at = coalesce(v_last.paid_at, now())
    WHERE id = p_entry_id
      AND company_id = v_entry.company_id
      AND status <> 'cancelled';
  ELSE
    UPDATE public.financial_entries
    SET status = 'partially_paid', payment_method = NULL, paid_at = NULL
    WHERE id = p_entry_id
      AND company_id = v_entry.company_id
      AND status <> 'cancelled';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Registro de pagamento com lock, teto e idempotência
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.register_financial_payment(
  p_entry_id uuid,
  p_payment_method text,
  p_amount_cents integer DEFAULT NULL,
  p_paid_at timestamptz DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
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
  v_paid integer;
  v_remaining integer;
  v_amount integer;
  v_key text;
  v_existing uuid;
  v_payment_id uuid;
  v_paid_at timestamptz;
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

  v_key := nullif(trim(p_idempotency_key), '');
  IF v_key IS NOT NULL AND char_length(v_key) < 8 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  IF v_key IS NULL THEN
    v_key := 'finance-pay:' || gen_random_uuid()::text;
  END IF;

  SELECT fp.financial_entry_id
  INTO v_existing
  FROM public.financial_payments fp
  WHERE fp.company_id = v_company_id
    AND fp.idempotency_key = v_key
    AND fp.cancelled_at IS NULL
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT
    fe.id,
    fe.status,
    fe.source_type,
    fe.customer_service_package_id,
    fe.amount_cents,
    fe.company_id
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = v_company_id
    AND fe.deleted_at IS NULL
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.status = 'cancelled' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  IF v_entry.source_type = 'sale' THEN
    RAISE EXCEPTION 'sale_entry_not_payable_via_finance' USING ERRCODE = '22023';
  END IF;

  v_remaining := private.financial_entry_remaining_cents(
    v_entry.id,
    v_entry.amount_cents,
    v_entry.status
  );

  IF v_entry.status = 'paid' AND v_remaining = 0 THEN
    IF v_entry.source_type = 'service_package' AND v_entry.customer_service_package_id IS NOT NULL THEN
      PERFORM private.refresh_customer_service_package_status(
        v_entry.customer_service_package_id,
        v_company_id
      );
    END IF;
    RETURN p_entry_id;
  END IF;

  v_amount := coalesce(p_amount_cents, v_remaining);

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
  END IF;

  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'payment_exceeds_balance' USING ERRCODE = '22023';
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

  v_paid_at := coalesce(p_paid_at, now());

  BEGIN
    INSERT INTO public.financial_payments (
      company_id,
      financial_entry_id,
      amount_cents,
      payment_method,
      paid_at,
      idempotency_key,
      created_by
    ) VALUES (
      v_company_id,
      p_entry_id,
      v_amount,
      p_payment_method,
      v_paid_at,
      v_key,
      v_user_id
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT fp.financial_entry_id
      INTO v_existing
      FROM public.financial_payments fp
      WHERE fp.company_id = v_company_id
        AND fp.idempotency_key = v_key
        AND fp.cancelled_at IS NULL
      LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RETURN v_existing;
      END IF;
      RAISE;
  END;

  v_paid := private.sum_active_financial_payments(p_entry_id);
  IF v_paid > v_entry.amount_cents THEN
    RAISE EXCEPTION 'payment_exceeds_balance' USING ERRCODE = '22023';
  END IF;

  PERFORM private.sync_financial_entry_payment_status(p_entry_id);

  IF v_entry.source_type = 'service_package'
    AND v_entry.customer_service_package_id IS NOT NULL
    AND v_paid >= v_entry.amount_cents
  THEN
    PERFORM private.refresh_customer_service_package_status(
      v_entry.customer_service_package_id,
      v_company_id
    );
  END IF;

  RETURN p_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION private.register_financial_payment(
  uuid, text, integer, timestamptz, text
) FROM PUBLIC, anon, authenticated;

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
BEGIN
  RETURN private.register_financial_payment(
    p_entry_id,
    p_payment_method,
    NULL,
    p_paid_at,
    NULL
  );
END;
$$;

DROP FUNCTION IF EXISTS public.mark_financial_entry_paid(uuid, text, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.mark_financial_entry_paid(
  p_entry_id uuid,
  p_payment_method text,
  p_paid_at timestamptz DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
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
  RETURN private.register_financial_payment(
    p_entry_id,
    p_payment_method,
    p_amount_cents,
    p_paid_at,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_financial_entry_paid(
  uuid, text, timestamptz, uuid, integer, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(
  uuid, text, timestamptz, uuid, integer, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Novos lançamentos manuais pagos geram parcela canônica
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.ensure_manual_paid_has_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.source_type <> 'manual' OR NEW.status <> 'paid' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_method IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.sum_active_financial_payments(NEW.id) > 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.financial_payments (
    company_id,
    financial_entry_id,
    amount_cents,
    payment_method,
    paid_at,
    idempotency_key,
    created_by
  ) VALUES (
    NEW.company_id,
    NEW.id,
    NEW.amount_cents,
    NEW.payment_method,
    coalesce(NEW.paid_at, now()),
    'manual-entry:' || NEW.id::text,
    NEW.created_by
  );

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_entries_ensure_manual_paid_payment ON public.financial_entries;
CREATE TRIGGER financial_entries_ensure_manual_paid_payment
  AFTER INSERT ON public.financial_entries
  FOR EACH ROW
  EXECUTE FUNCTION private.ensure_manual_paid_has_payment();

-- ---------------------------------------------------------------------------
-- 5. Reabertura — somente manual, cancelando pagamentos de forma auditável
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.reopen_financial_entry(p_entry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_entry record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT fe.id, fe.status, fe.source_type
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = v_company_id
    AND fe.deleted_at IS NULL
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.status NOT IN ('paid', 'partially_paid') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  IF v_entry.source_type = 'service_order' THEN
    RAISE EXCEPTION 'service_order_entry_not_reopenable' USING ERRCODE = '22023';
  END IF;

  IF v_entry.source_type = 'service_package' THEN
    RAISE EXCEPTION 'package_entry_not_reopenable' USING ERRCODE = '22023';
  END IF;

  IF v_entry.source_type = 'sale' THEN
    RAISE EXCEPTION 'sale_entry_not_reopenable' USING ERRCODE = '22023';
  END IF;

  IF v_entry.source_type <> 'manual' THEN
    RAISE EXCEPTION 'automatic_entry_not_reopenable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.financial_payments
  SET cancelled_at = now(), cancelled_by = v_user_id
  WHERE financial_entry_id = p_entry_id
    AND company_id = v_company_id
    AND cancelled_at IS NULL;

  PERFORM private.sync_financial_entry_payment_status(p_entry_id);

  RETURN p_entry_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Cancelamento — manual pending sem dinheiro recebido
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cancel_financial_entry(p_entry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_entry record;
  v_received integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT fe.id, fe.status, fe.source_type, fe.amount_cents
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = v_company_id
    AND fe.deleted_at IS NULL
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.source_type = 'service_order' THEN
    RAISE EXCEPTION 'service_order_entry_not_cancellable' USING ERRCODE = '22023';
  END IF;

  IF v_entry.source_type = 'service_package' THEN
    RAISE EXCEPTION 'package_entry_not_cancellable' USING ERRCODE = '22023';
  END IF;

  IF v_entry.source_type = 'sale' THEN
    RAISE EXCEPTION 'sale_entry_not_cancellable' USING ERRCODE = '22023';
  END IF;

  IF v_entry.source_type <> 'manual' THEN
    RAISE EXCEPTION 'automatic_entry_not_cancellable' USING ERRCODE = '22023';
  END IF;

  IF v_entry.status = 'cancelled' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  v_received := private.financial_entry_received_cents(
    v_entry.id,
    v_entry.amount_cents,
    v_entry.status
  );

  IF v_entry.status <> 'pending' OR v_received > 0 THEN
    RAISE EXCEPTION 'financial_entry_has_payments_requires_refund' USING ERRCODE = '22023';
  END IF;

  UPDATE public.financial_entries
  SET status = 'cancelled', cancelled_at = now()
  WHERE id = p_entry_id AND company_id = v_company_id;

  RETURN p_entry_id;
END;
$$;
