-- PetGestor — Etapa 9: financeiro (financial_entries)
-- MIGRATION PENDENTE — aplicar manualmente no Supabase SQL Editor

-- ---------------------------------------------------------------------------
-- service_orders: UNIQUE composto para FK financeira
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_id_company_id_key UNIQUE (id, company_id);

-- ---------------------------------------------------------------------------
-- financial_entries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  source_type text NOT NULL DEFAULT 'manual',
  service_order_id uuid,
  description text NOT NULL,
  category text,
  amount_cents integer NOT NULL,
  due_date date,
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT financial_entries_entry_type_check CHECK (
    entry_type IN ('income', 'expense')
  ),
  CONSTRAINT financial_entries_status_check CHECK (
    status IN ('pending', 'paid', 'cancelled')
  ),
  CONSTRAINT financial_entries_source_type_check CHECK (
    source_type IN ('service_order', 'manual')
  ),
  CONSTRAINT financial_entries_payment_method_check CHECK (
    payment_method IS NULL
    OR payment_method IN ('cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other')
  ),
  CONSTRAINT financial_entries_amount_check CHECK (
    amount_cents > 0
    AND amount_cents <= 99999999
  ),
  CONSTRAINT financial_entries_description_length CHECK (
    char_length(description) >= 2
    AND char_length(description) <= 160
  ),
  CONSTRAINT financial_entries_category_length CHECK (
    category IS NULL
    OR char_length(category) <= 80
  ),
  CONSTRAINT financial_entries_notes_length CHECK (
    notes IS NULL
    OR char_length(notes) <= 3000
  ),
  CONSTRAINT financial_entries_source_service_order_check CHECK (
    (source_type = 'service_order' AND service_order_id IS NOT NULL)
    OR (source_type = 'manual' AND service_order_id IS NULL)
  ),
  CONSTRAINT financial_entries_paid_requires_method CHECK (
    status <> 'paid'
    OR payment_method IS NOT NULL
  ),
  CONSTRAINT financial_entries_paid_requires_paid_at CHECK (
    status <> 'paid'
    OR paid_at IS NOT NULL
  ),
  CONSTRAINT financial_entries_service_order_company_fkey
    FOREIGN KEY (service_order_id, company_id)
    REFERENCES public.service_orders (id, company_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_entries_service_order_unique
  ON public.financial_entries (company_id, service_order_id)
  WHERE source_type = 'service_order'
    AND service_order_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_company_created
  ON public.financial_entries (company_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_company_status
  ON public.financial_entries (company_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_company_entry_type
  ON public.financial_entries (company_id, entry_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_company_due_date
  ON public.financial_entries (company_id, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_company_paid_at
  ON public.financial_entries (company_id, paid_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_company_service_order
  ON public.financial_entries (company_id, service_order_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS financial_entries_set_updated_at ON public.financial_entries;
CREATE TRIGGER financial_entries_set_updated_at
  BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS financial_entries_prevent_company_change ON public.financial_entries;
CREATE TRIGGER financial_entries_prevent_company_change
  BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_entries_select ON public.financial_entries;
CREATE POLICY financial_entries_select ON public.financial_entries
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS financial_entries_insert ON public.financial_entries;
CREATE POLICY financial_entries_insert ON public.financial_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS financial_entries_update ON public.financial_entries;
CREATE POLICY financial_entries_update ON public.financial_entries
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- RPC: mark_service_order_ready (atualizada — cria receita pending)
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
-- RPC: mark_financial_entry_paid
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_financial_entry_paid(
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

  SELECT fe.id, fe.status INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = v_company_id
    AND fe.deleted_at IS NULL;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.financial_entries
  SET
    status = 'paid',
    payment_method = p_payment_method,
    paid_at = COALESCE(p_paid_at, now())
  WHERE id = p_entry_id AND company_id = v_company_id;

  RETURN p_entry_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: reopen_financial_entry
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reopen_financial_entry(
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

  SELECT fe.id, fe.status INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = v_company_id
    AND fe.deleted_at IS NULL;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.status <> 'paid' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.financial_entries
  SET
    status = 'pending',
    payment_method = NULL,
    paid_at = NULL
  WHERE id = p_entry_id AND company_id = v_company_id;

  RETURN p_entry_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel_financial_entry
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

REVOKE ALL ON FUNCTION public.mark_service_order_ready(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_financial_entry_paid(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_financial_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_financial_entry(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_service_order_ready(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_financial_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_financial_entry(uuid) TO authenticated;
