-- PetGestor — pacotes de serviços (catálogo, venda, consumo e histórico)

-- ---------------------------------------------------------------------------
-- service_packages (catálogo)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL,
  validity_days integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT service_packages_name_length CHECK (
    char_length(trim(name)) >= 2
    AND char_length(name) <= 120
  ),
  CONSTRAINT service_packages_description_length CHECK (
    description IS NULL
    OR char_length(description) <= 2000
  ),
  CONSTRAINT service_packages_price_cents_check CHECK (
    price_cents > 0
    AND price_cents <= 99999999
  ),
  CONSTRAINT service_packages_validity_days_check CHECK (
    validity_days >= 1
    AND validity_days <= 3650
  ),
  CONSTRAINT service_packages_id_company_id_key UNIQUE (id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_service_packages_company_active
  ON public.service_packages (company_id, active)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- service_package_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  package_id uuid NOT NULL,
  service_id uuid NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_package_items_quantity_check CHECK (
    quantity >= 1
    AND quantity <= 999
  ),
  CONSTRAINT service_package_items_package_service_key UNIQUE (package_id, service_id),
  CONSTRAINT service_package_items_package_company_fkey
    FOREIGN KEY (package_id, company_id)
    REFERENCES public.service_packages (id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT service_package_items_service_company_fkey
    FOREIGN KEY (service_id, company_id)
    REFERENCES public.services (id, company_id)
    ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- customer_service_packages (pacote vendido)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  pet_id uuid NOT NULL,
  package_id uuid,
  package_name_snapshot text NOT NULL,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  starts_at date NOT NULL,
  expires_at date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  price_cents_snapshot integer NOT NULL,
  financial_entry_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_service_packages_status_check CHECK (
    status IN ('active', 'expired', 'fully_used', 'cancelled')
  ),
  CONSTRAINT customer_service_packages_price_cents_check CHECK (
    price_cents_snapshot > 0
    AND price_cents_snapshot <= 99999999
  ),
  CONSTRAINT customer_service_packages_package_name_length CHECK (
    char_length(package_name_snapshot) >= 2
    AND char_length(package_name_snapshot) <= 120
  ),
  CONSTRAINT customer_service_packages_expires_after_starts CHECK (
    expires_at >= starts_at
  ),
  CONSTRAINT customer_service_packages_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT customer_service_packages_customer_company_fkey
    FOREIGN KEY (customer_id, company_id)
    REFERENCES public.customers (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_service_packages_pet_customer_company_fkey
    FOREIGN KEY (pet_id, customer_id, company_id)
    REFERENCES public.pets (id, customer_id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_service_packages_package_company_fkey
    FOREIGN KEY (package_id, company_id)
    REFERENCES public.service_packages (id, company_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_service_packages_pet_status
  ON public.customer_service_packages (company_id, pet_id, status);

-- ---------------------------------------------------------------------------
-- customer_service_package_items (saldos por serviço)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_service_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_package_id uuid NOT NULL,
  service_id uuid NOT NULL,
  service_name_snapshot text NOT NULL,
  quantity_total integer NOT NULL,
  quantity_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_service_package_items_quantity_total_check CHECK (
    quantity_total >= 1
    AND quantity_total <= 999
  ),
  CONSTRAINT customer_service_package_items_quantity_used_check CHECK (
    quantity_used >= 0
    AND quantity_used <= quantity_total
  ),
  CONSTRAINT customer_service_package_items_service_name_length CHECK (
    char_length(service_name_snapshot) >= 2
    AND char_length(service_name_snapshot) <= 120
  ),
  CONSTRAINT customer_service_package_items_package_service_key
    UNIQUE (customer_package_id, service_id),
  CONSTRAINT customer_service_package_items_id_company_id_key
    UNIQUE (id, company_id),
  CONSTRAINT customer_service_package_items_package_company_fkey
    FOREIGN KEY (customer_package_id, company_id)
    REFERENCES public.customer_service_packages (id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT customer_service_package_items_service_company_fkey
    FOREIGN KEY (service_id, company_id)
    REFERENCES public.services (id, company_id)
    ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- customer_service_package_usages (histórico de consumo)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_service_package_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_package_id uuid NOT NULL,
  customer_package_item_id uuid NOT NULL,
  service_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'consumed',
  original_price_cents_snapshot integer NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_service_package_usages_status_check CHECK (
    status IN ('consumed', 'reversed')
  ),
  CONSTRAINT customer_service_package_usages_quantity_check CHECK (
    quantity = 1
  ),
  CONSTRAINT customer_service_package_usages_price_check CHECK (
    original_price_cents_snapshot >= 0
    AND original_price_cents_snapshot <= 999999
  ),
  CONSTRAINT customer_service_package_usages_package_company_fkey
    FOREIGN KEY (customer_package_id, company_id)
    REFERENCES public.customer_service_packages (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_service_package_usages_item_company_fkey
    FOREIGN KEY (customer_package_item_id, company_id)
    REFERENCES public.customer_service_package_items (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_service_package_usages_appointment_company_fkey
    FOREIGN KEY (appointment_id, company_id)
    REFERENCES public.appointments (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_service_package_usages_service_order_company_fkey
    FOREIGN KEY (service_order_id, company_id)
    REFERENCES public.service_orders (id, company_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_service_package_usages_service_order_consumed_uidx
  ON public.customer_service_package_usages (company_id, service_order_id)
  WHERE status = 'consumed';

-- ---------------------------------------------------------------------------
-- financial_entries: vincular venda de pacote
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS customer_service_package_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_entries_id_company_id_key'
  ) THEN
    ALTER TABLE public.financial_entries
      ADD CONSTRAINT financial_entries_id_company_id_key UNIQUE (id, company_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_entries_customer_package_company_fkey'
  ) THEN
    ALTER TABLE public.financial_entries
      ADD CONSTRAINT financial_entries_customer_package_company_fkey
      FOREIGN KEY (customer_service_package_id, company_id)
      REFERENCES public.customer_service_packages (id, company_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.financial_entries
  DROP CONSTRAINT IF EXISTS financial_entries_source_type_check;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT financial_entries_source_type_check CHECK (
    source_type IN ('service_order', 'manual', 'service_package')
  );

ALTER TABLE public.financial_entries
  DROP CONSTRAINT IF EXISTS financial_entries_source_service_order_check;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT financial_entries_source_service_order_check CHECK (
    (source_type = 'service_order' AND service_order_id IS NOT NULL AND customer_service_package_id IS NULL)
    OR (source_type = 'manual' AND service_order_id IS NULL AND customer_service_package_id IS NULL)
    OR (source_type = 'service_package' AND customer_service_package_id IS NOT NULL AND service_order_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS financial_entries_customer_package_unique
  ON public.financial_entries (company_id, customer_service_package_id)
  WHERE source_type = 'service_package'
    AND customer_service_package_id IS NOT NULL
    AND deleted_at IS NULL;

-- financial_entry_id é preenchido após criar a receita (sem FK circular)

-- ---------------------------------------------------------------------------
-- Triggers updated_at + prevent_company_change
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS service_packages_set_updated_at ON public.service_packages;
CREATE TRIGGER service_packages_set_updated_at
  BEFORE UPDATE ON public.service_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS service_package_items_set_updated_at ON public.service_package_items;
CREATE TRIGGER service_package_items_set_updated_at
  BEFORE UPDATE ON public.service_package_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS customer_service_packages_set_updated_at ON public.customer_service_packages;
CREATE TRIGGER customer_service_packages_set_updated_at
  BEFORE UPDATE ON public.customer_service_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS customer_service_package_items_set_updated_at ON public.customer_service_package_items;
CREATE TRIGGER customer_service_package_items_set_updated_at
  BEFORE UPDATE ON public.customer_service_package_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS customer_service_package_usages_set_updated_at ON public.customer_service_package_usages;
CREATE TRIGGER customer_service_package_usages_set_updated_at
  BEFORE UPDATE ON public.customer_service_package_usages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS service_packages_prevent_company_change ON public.service_packages;
CREATE TRIGGER service_packages_prevent_company_change
  BEFORE UPDATE ON public.service_packages
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS service_package_items_prevent_company_change ON public.service_package_items;
CREATE TRIGGER service_package_items_prevent_company_change
  BEFORE UPDATE ON public.service_package_items
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS customer_service_packages_prevent_company_change ON public.customer_service_packages;
CREATE TRIGGER customer_service_packages_prevent_company_change
  BEFORE UPDATE ON public.customer_service_packages
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS customer_service_package_items_prevent_company_change ON public.customer_service_package_items;
CREATE TRIGGER customer_service_package_items_prevent_company_change
  BEFORE UPDATE ON public.customer_service_package_items
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS customer_service_package_usages_prevent_company_change ON public.customer_service_package_usages;
CREATE TRIGGER customer_service_package_usages_prevent_company_change
  BEFORE UPDATE ON public.customer_service_package_usages
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_service_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_service_package_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_packages_select_member ON public.service_packages;
CREATE POLICY service_packages_select_member ON public.service_packages
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_packages_insert_member ON public.service_packages;
CREATE POLICY service_packages_insert_member ON public.service_packages
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS service_packages_update_member ON public.service_packages;
CREATE POLICY service_packages_update_member ON public.service_packages
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_package_items_select_member ON public.service_package_items;
CREATE POLICY service_package_items_select_member ON public.service_package_items
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_package_items_insert_member ON public.service_package_items;
CREATE POLICY service_package_items_insert_member ON public.service_package_items
  FOR INSERT TO authenticated WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_package_items_update_member ON public.service_package_items;
CREATE POLICY service_package_items_update_member ON public.service_package_items
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_package_items_delete_member ON public.service_package_items;
CREATE POLICY service_package_items_delete_member ON public.service_package_items
  FOR DELETE TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_packages_select_member ON public.customer_service_packages;
CREATE POLICY customer_service_packages_select_member ON public.customer_service_packages
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_packages_insert_member ON public.customer_service_packages;
CREATE POLICY customer_service_packages_insert_member ON public.customer_service_packages
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS customer_service_packages_update_member ON public.customer_service_packages;
CREATE POLICY customer_service_packages_update_member ON public.customer_service_packages
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_package_items_select_member ON public.customer_service_package_items;
CREATE POLICY customer_service_package_items_select_member ON public.customer_service_package_items
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_package_items_insert_member ON public.customer_service_package_items;
CREATE POLICY customer_service_package_items_insert_member ON public.customer_service_package_items
  FOR INSERT TO authenticated WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_package_items_update_member ON public.customer_service_package_items;
CREATE POLICY customer_service_package_items_update_member ON public.customer_service_package_items
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_package_usages_select_member ON public.customer_service_package_usages;
CREATE POLICY customer_service_package_usages_select_member ON public.customer_service_package_usages
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_package_usages_insert_member ON public.customer_service_package_usages;
CREATE POLICY customer_service_package_usages_insert_member ON public.customer_service_package_usages
  FOR INSERT TO authenticated WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_package_usages_update_member ON public.customer_service_package_usages;
CREATE POLICY customer_service_package_usages_update_member ON public.customer_service_package_usages
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.service_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_package_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_service_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_service_package_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_service_package_usages TO authenticated;

-- ---------------------------------------------------------------------------
-- Helper: recalcular status do pacote vendido
-- ---------------------------------------------------------------------------

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
BEGIN
  SELECT csp.id, csp.status, csp.expires_at
  INTO v_pkg
  FROM public.customer_service_packages csp
  WHERE csp.id = p_customer_package_id
    AND csp.company_id = p_company_id;

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
    WHERE id = p_customer_package_id AND company_id = p_company_id;
    RETURN;
  END IF;

  IF v_pkg.expires_at < (timezone(
    (SELECT c.timezone FROM public.companies c WHERE c.id = p_company_id),
    now()
  ))::date THEN
    UPDATE public.customer_service_packages
    SET status = 'expired'
    WHERE id = p_customer_package_id AND company_id = p_company_id;
    RETURN;
  END IF;

  UPDATE public.customer_service_packages
  SET status = 'active'
  WHERE id = p_customer_package_id
    AND company_id = p_company_id
    AND status <> 'cancelled';
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_customer_service_package_status(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- RPC: create_service_package_with_items
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_service_package_with_items(
  p_name text,
  p_description text,
  p_price_cents integer,
  p_validity_days integer,
  p_active boolean DEFAULT true,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_package_id uuid;
  v_item jsonb;
  v_service_id uuid;
  v_quantity integer;
  v_service_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF char_length(trim(p_name)) < 2 OR char_length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF p_price_cents IS NULL OR p_price_cents <= 0 OR p_price_cents > 99999999 THEN
    RAISE EXCEPTION 'invalid_price_cents' USING ERRCODE = '22023';
  END IF;

  IF p_validity_days IS NULL OR p_validity_days < 1 OR p_validity_days > 3650 THEN
    RAISE EXCEPTION 'invalid_validity_days' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'invalid_package_items' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.service_packages (
    company_id, name, description, price_cents, validity_days, active, created_by
  ) VALUES (
    v_company_id,
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    p_price_cents,
    p_validity_days,
    coalesce(p_active, true),
    v_user_id
  )
  RETURNING id INTO v_package_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_service_id := (v_item->>'service_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_service_id IS NULL OR v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 999 THEN
      RAISE EXCEPTION 'invalid_package_item' USING ERRCODE = '22023';
    END IF;

    IF v_service_id = ANY (v_service_ids) THEN
      RAISE EXCEPTION 'duplicate_service_in_package' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = v_service_id
        AND s.company_id = v_company_id
        AND s.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.service_package_items (
      company_id, package_id, service_id, quantity
    ) VALUES (
      v_company_id, v_package_id, v_service_id, v_quantity
    );

    v_service_ids := array_append(v_service_ids, v_service_id);
  END LOOP;

  RETURN v_package_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_service_package_with_items
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_service_package_with_items(
  p_package_id uuid,
  p_name text,
  p_description text,
  p_price_cents integer,
  p_validity_days integer,
  p_active boolean,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_item jsonb;
  v_service_id uuid;
  v_quantity integer;
  v_service_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.service_packages sp
    WHERE sp.id = p_package_id
      AND sp.company_id = v_company_id
      AND sp.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'package_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF char_length(trim(p_name)) < 2 OR char_length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF p_price_cents IS NULL OR p_price_cents <= 0 OR p_price_cents > 99999999 THEN
    RAISE EXCEPTION 'invalid_price_cents' USING ERRCODE = '22023';
  END IF;

  IF p_validity_days IS NULL OR p_validity_days < 1 OR p_validity_days > 3650 THEN
    RAISE EXCEPTION 'invalid_validity_days' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'invalid_package_items' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_packages
  SET
    name = trim(p_name),
    description = nullif(trim(coalesce(p_description, '')), ''),
    price_cents = p_price_cents,
    validity_days = p_validity_days,
    active = coalesce(p_active, true)
  WHERE id = p_package_id AND company_id = v_company_id;

  DELETE FROM public.service_package_items
  WHERE package_id = p_package_id AND company_id = v_company_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_service_id := (v_item->>'service_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_service_id IS NULL OR v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 999 THEN
      RAISE EXCEPTION 'invalid_package_item' USING ERRCODE = '22023';
    END IF;

    IF v_service_id = ANY (v_service_ids) THEN
      RAISE EXCEPTION 'duplicate_service_in_package' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = v_service_id
        AND s.company_id = v_company_id
        AND s.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.service_package_items (
      company_id, package_id, service_id, quantity
    ) VALUES (
      v_company_id, p_package_id, v_service_id, v_quantity
    );

    v_service_ids := array_append(v_service_ids, v_service_id);
  END LOOP;

  RETURN p_package_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: sell_customer_service_package
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sell_customer_service_package(
  p_package_id uuid,
  p_customer_id uuid,
  p_pet_id uuid,
  p_starts_at date,
  p_financial_status text DEFAULT 'pending',
  p_payment_method text DEFAULT NULL
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
  v_customer_package_id uuid;
  v_financial_entry_id uuid;
  v_expires_at date;
  v_item record;
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

  IF p_starts_at IS NULL THEN
    RAISE EXCEPTION 'invalid_starts_at' USING ERRCODE = '22023';
  END IF;

  IF p_financial_status NOT IN ('pending', 'paid') THEN
    RAISE EXCEPTION 'invalid_financial_status' USING ERRCODE = '22023';
  END IF;

  IF p_financial_status = 'paid' AND p_payment_method IS NULL THEN
    RAISE EXCEPTION 'payment_method_required' USING ERRCODE = '22023';
  END IF;

  SELECT sp.id, sp.name, sp.price_cents, sp.validity_days
  INTO v_package
  FROM public.service_packages sp
  WHERE sp.id = p_package_id
    AND sp.company_id = v_company_id
    AND sp.deleted_at IS NULL
    AND sp.active = true;

  IF v_package.id IS NULL THEN
    RAISE EXCEPTION 'package_not_found' USING ERRCODE = 'P0002';
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

  v_expires_at := p_starts_at + (v_package.validity_days - 1);

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
    created_by
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
    v_user_id
  )
  RETURNING id INTO v_customer_package_id;

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

  RETURN v_customer_package_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: consume_customer_service_package
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_customer_service_package(
  p_service_order_id uuid,
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
  v_order record;
  v_appointment record;
  v_pkg record;
  v_balance record;
  v_usage_id uuid;
  v_original_price integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_service_package_usages u
    WHERE u.service_order_id = p_service_order_id
      AND u.company_id = v_company_id
      AND u.status = 'consumed'
  ) THEN
    RAISE EXCEPTION 'package_already_consumed' USING ERRCODE = '22023';
  END IF;

  SELECT so.id, so.status, so.appointment_id
  INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status NOT IN ('waiting', 'in_progress') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  SELECT a.id, a.pet_id, a.service_id, a.price_cents_snapshot
  INTO v_appointment
  FROM public.appointments a
  WHERE a.id = v_order.appointment_id
    AND a.company_id = v_company_id
    AND a.deleted_at IS NULL;

  IF v_appointment.id IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_appointment.price_cents_snapshot = 0 THEN
    RAISE EXCEPTION 'appointment_already_covered' USING ERRCODE = '22023';
  END IF;

  SELECT csp.id, csp.status, csp.expires_at, csp.pet_id
  INTO v_pkg
  FROM public.customer_service_packages csp
  WHERE csp.id = p_customer_package_id
    AND csp.company_id = v_company_id;

  IF v_pkg.id IS NULL THEN
    RAISE EXCEPTION 'customer_package_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_pkg.pet_id <> v_appointment.pet_id THEN
    RAISE EXCEPTION 'package_pet_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_pkg.status <> 'active' THEN
    RAISE EXCEPTION 'package_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_pkg.expires_at < (timezone(
    (SELECT c.timezone FROM public.companies c WHERE c.id = v_company_id),
    now()
  ))::date THEN
    PERFORM private.refresh_customer_service_package_status(p_customer_package_id, v_company_id);
    RAISE EXCEPTION 'package_expired' USING ERRCODE = '22023';
  END IF;

  SELECT cspi.id, cspi.quantity_total, cspi.quantity_used
  INTO v_balance
  FROM public.customer_service_package_items cspi
  WHERE cspi.customer_package_id = p_customer_package_id
    AND cspi.company_id = v_company_id
    AND cspi.service_id = v_appointment.service_id
    AND cspi.quantity_used < cspi.quantity_total
  FOR UPDATE;

  IF v_balance.id IS NULL THEN
    RAISE EXCEPTION 'package_balance_unavailable' USING ERRCODE = '22023';
  END IF;

  v_original_price := v_appointment.price_cents_snapshot;

  UPDATE public.customer_service_package_items
  SET quantity_used = quantity_used + 1
  WHERE id = v_balance.id AND company_id = v_company_id;

  UPDATE public.appointments
  SET price_cents_snapshot = 0
  WHERE id = v_appointment.id AND company_id = v_company_id;

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
    v_company_id,
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

  PERFORM private.refresh_customer_service_package_status(p_customer_package_id, v_company_id);

  RETURN v_usage_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: reverse_customer_service_package_usage
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_customer_service_package_usage(
  p_service_order_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_usage record;
  v_order record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT u.id, u.customer_package_id, u.customer_package_item_id, u.appointment_id,
         u.original_price_cents_snapshot
  INTO v_usage
  FROM public.customer_service_package_usages u
  WHERE u.service_order_id = p_service_order_id
    AND u.company_id = v_company_id
    AND u.status = 'consumed'
  FOR UPDATE;

  IF v_usage.id IS NULL THEN
    RAISE EXCEPTION 'usage_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT so.status INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.customer_service_package_items
  SET quantity_used = quantity_used - 1
  WHERE id = v_usage.customer_package_item_id
    AND company_id = v_company_id
    AND quantity_used > 0;

  UPDATE public.appointments
  SET price_cents_snapshot = v_usage.original_price_cents_snapshot
  WHERE id = v_usage.appointment_id AND company_id = v_company_id;

  UPDATE public.customer_service_package_usages
  SET status = 'reversed', reversed_at = now()
  WHERE id = v_usage.id AND company_id = v_company_id;

  PERFORM private.refresh_customer_service_package_status(v_usage.customer_package_id, v_company_id);

  RETURN v_usage.id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel_customer_service_package
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_customer_service_package(
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
    AND csp.company_id = v_company_id;

  IF v_pkg.id IS NULL THEN
    RAISE EXCEPTION 'customer_package_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_pkg.status = 'cancelled' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_service_package_usages u
    WHERE u.customer_package_id = p_customer_package_id
      AND u.company_id = v_company_id
      AND u.status = 'consumed'
  ) THEN
    RAISE EXCEPTION 'package_has_usages' USING ERRCODE = '22023';
  END IF;

  UPDATE public.customer_service_packages
  SET status = 'cancelled'
  WHERE id = p_customer_package_id AND company_id = v_company_id;

  IF v_pkg.financial_entry_id IS NOT NULL THEN
    UPDATE public.financial_entries
    SET status = 'cancelled', cancelled_at = now()
    WHERE id = v_pkg.financial_entry_id
      AND company_id = v_company_id
      AND status = 'pending'
      AND source_type = 'service_package';
  END IF;

  RETURN p_customer_package_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- mark_service_order_ready: não gera receita quando preço = 0 (pacote)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_service_order_ready(
  p_service_order_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_order record;
  v_appointment record;
  v_description text;
  v_due_date date;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT so.id, so.status, so.appointment_id INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'in_progress' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_orders
  SET status = 'ready', ready_at = now()
  WHERE id = p_service_order_id AND company_id = v_company_id;

  UPDATE public.appointments
  SET status = 'completed'
  WHERE id = v_order.appointment_id
    AND company_id = v_company_id
    AND status = 'in_progress';

  SELECT
    a.price_cents_snapshot,
    a.service_name_snapshot,
    p.name AS pet_name
  INTO v_appointment
  FROM public.appointments a
  INNER JOIN public.pets p
    ON p.id = a.pet_id
    AND p.company_id = a.company_id
  WHERE a.id = v_order.appointment_id
    AND a.company_id = v_company_id;

  IF v_appointment.price_cents_snapshot IS NULL THEN
    RAISE EXCEPTION 'appointment_price_unavailable' USING ERRCODE = '22023';
  END IF;

  IF v_appointment.price_cents_snapshot = 0 THEN
    RETURN p_service_order_id;
  END IF;

  v_description := left(
    v_appointment.service_name_snapshot || ' · ' || v_appointment.pet_name,
    160
  );
  v_due_date := (timezone(
    (SELECT c.timezone FROM public.companies c WHERE c.id = v_company_id),
    now()
  ))::date;

  INSERT INTO public.financial_entries (
    company_id,
    entry_type,
    status,
    source_type,
    service_order_id,
    description,
    category,
    amount_cents,
    due_date,
    created_by
  )
  SELECT
    v_company_id,
    'income',
    'pending',
    'service_order',
    p_service_order_id,
    v_description,
    'Serviços',
    v_appointment.price_cents_snapshot,
    v_due_date,
    v_user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.financial_entries fe
    WHERE fe.company_id = v_company_id
      AND fe.service_order_id = p_service_order_id
      AND fe.source_type = 'service_order'
      AND fe.deleted_at IS NULL
  );

  RETURN p_service_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- cancel_financial_entry: permitir cancelar receita de pacote pending
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_financial_entry(
  p_entry_id uuid
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT fe.id, fe.status, fe.source_type INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = v_company_id
    AND fe.deleted_at IS NULL;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.source_type = 'service_order' THEN
    RAISE EXCEPTION 'service_order_entry_not_cancellable' USING ERRCODE = '22023';
  END IF;

  IF v_entry.status = 'cancelled' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.financial_entries
  SET status = 'cancelled', cancelled_at = now()
  WHERE id = p_entry_id AND company_id = v_company_id;

  RETURN p_entry_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_service_package_with_items(text, text, integer, integer, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_service_package_with_items(uuid, text, text, integer, integer, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sell_customer_service_package(uuid, uuid, uuid, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_customer_service_package(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_customer_service_package_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_customer_service_package(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_service_package_with_items(text, text, integer, integer, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_package_with_items(uuid, text, text, integer, integer, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_customer_service_package(uuid, uuid, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_customer_service_package(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_customer_service_package_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_service_package(uuid) TO authenticated;

COMMENT ON TABLE public.service_packages IS 'Catálogo de pacotes oferecidos pela empresa.';
COMMENT ON TABLE public.customer_service_packages IS 'Pacotes vendidos a tutor/pet com validade e saldo.';
