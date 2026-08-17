-- PetGestor — pagamentos parciais + fechamento de caixa

-- ---------------------------------------------------------------------------
-- financial_payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.financial_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  financial_entry_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  payment_method text NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  idempotency_key text,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users (id),
  CONSTRAINT financial_payments_amount_check CHECK (
    amount_cents > 0
    AND amount_cents <= 99999999
  ),
  CONSTRAINT financial_payments_payment_method_check CHECK (
    payment_method IN ('cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other')
  ),
  CONSTRAINT financial_payments_notes_length CHECK (
    notes IS NULL
    OR char_length(notes) <= 500
  ),
  CONSTRAINT financial_payments_entry_company_fkey
    FOREIGN KEY (financial_entry_id, company_id)
    REFERENCES public.financial_entries (id, company_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_payments_idempotency_unique
  ON public.financial_payments (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_payments_company_entry
  ON public.financial_payments (company_id, financial_entry_id)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_payments_company_paid_at
  ON public.financial_payments (company_id, paid_at)
  WHERE cancelled_at IS NULL;

ALTER TABLE public.financial_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_payments_select ON public.financial_payments;
CREATE POLICY financial_payments_select ON public.financial_payments
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS financial_payments_insert ON public.financial_payments;
CREATE POLICY financial_payments_insert ON public.financial_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS financial_payments_update ON public.financial_payments;
CREATE POLICY financial_payments_update ON public.financial_payments
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.financial_payments TO authenticated;

-- ---------------------------------------------------------------------------
-- cash_closings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cash_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  business_date date NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_balance_cents integer NOT NULL DEFAULT 0,
  expected_cash_cents integer,
  actual_cash_cents integer,
  difference_cents integer,
  total_received_cents integer NOT NULL DEFAULT 0,
  cash_received_cents integer NOT NULL DEFAULT 0,
  pix_received_cents integer NOT NULL DEFAULT 0,
  debit_received_cents integer NOT NULL DEFAULT 0,
  credit_received_cents integer NOT NULL DEFAULT 0,
  transfer_received_cents integer NOT NULL DEFAULT 0,
  other_received_cents integer NOT NULL DEFAULT 0,
  expense_paid_cents integer NOT NULL DEFAULT 0,
  net_balance_cents integer NOT NULL DEFAULT 0,
  notes text,
  closed_by uuid REFERENCES auth.users (id),
  reopened_at timestamptz,
  reopened_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_closings_opening_balance_check CHECK (
    opening_balance_cents >= 0
    AND opening_balance_cents <= 99999999
  ),
  CONSTRAINT cash_closings_notes_length CHECK (
    notes IS NULL
    OR char_length(notes) <= 1000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_closings_company_date_active
  ON public.cash_closings (company_id, business_date)
  WHERE closed_at IS NOT NULL AND reopened_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_closings_company_date
  ON public.cash_closings (company_id, business_date DESC);

DROP TRIGGER IF EXISTS cash_closings_set_updated_at ON public.cash_closings;
CREATE TRIGGER cash_closings_set_updated_at
  BEFORE UPDATE ON public.cash_closings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS cash_closings_prevent_company_change ON public.cash_closings;
CREATE TRIGGER cash_closings_prevent_company_change
  BEFORE UPDATE ON public.cash_closings
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_closings_select ON public.cash_closings;
CREATE POLICY cash_closings_select ON public.cash_closings
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS cash_closings_insert ON public.cash_closings;
CREATE POLICY cash_closings_insert ON public.cash_closings
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
  );

DROP POLICY IF EXISTS cash_closings_update ON public.cash_closings;
CREATE POLICY cash_closings_update ON public.cash_closings
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.cash_closings TO authenticated;

-- ---------------------------------------------------------------------------
-- financial_entries: status partially_paid
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_entries
  DROP CONSTRAINT IF EXISTS financial_entries_status_check;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT financial_entries_status_check CHECK (
    status IN ('pending', 'partially_paid', 'paid', 'cancelled')
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.sum_active_financial_payments(p_entry_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT COALESCE(SUM(fp.amount_cents), 0)::integer
  FROM public.financial_payments fp
  WHERE fp.financial_entry_id = p_entry_id
    AND fp.cancelled_at IS NULL;
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
  SELECT fe.id, fe.amount_cents, fe.status
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.deleted_at IS NULL;

  IF v_entry.id IS NULL OR v_entry.status = 'cancelled' THEN
    RETURN;
  END IF;

  v_paid := private.sum_active_financial_payments(p_entry_id);

  SELECT fp.payment_method, fp.paid_at
  INTO v_last
  FROM public.financial_payments fp
  WHERE fp.financial_entry_id = p_entry_id
    AND fp.cancelled_at IS NULL
  ORDER BY fp.paid_at DESC, fp.created_at DESC
  LIMIT 1;

  IF v_paid <= 0 THEN
    UPDATE public.financial_entries
    SET status = 'pending', payment_method = NULL, paid_at = NULL
    WHERE id = p_entry_id;
  ELSIF v_paid >= v_entry.amount_cents THEN
    UPDATE public.financial_entries
    SET
      status = 'paid',
      payment_method = v_last.payment_method,
      paid_at = COALESCE(v_last.paid_at, now())
    WHERE id = p_entry_id;
  ELSE
    UPDATE public.financial_entries
    SET status = 'partially_paid', payment_method = NULL, paid_at = NULL
    WHERE id = p_entry_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: record_financial_payment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_financial_payment(
  p_entry_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_paid_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
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
  v_paid integer;
  v_remaining integer;
  v_payment_id uuid;
  v_notes text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN (
    'cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT fp.id INTO v_payment_id
    FROM public.financial_payments fp
    WHERE fp.company_id = v_company_id
      AND fp.idempotency_key = p_idempotency_key
      AND fp.cancelled_at IS NULL;

    IF v_payment_id IS NOT NULL THEN
      RETURN v_payment_id;
    END IF;
  END IF;

  SELECT fe.id, fe.amount_cents, fe.status
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = v_company_id
    AND fe.deleted_at IS NULL;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.status NOT IN ('pending', 'partially_paid') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  v_paid := private.sum_active_financial_payments(p_entry_id);
  v_remaining := v_entry.amount_cents - v_paid;

  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'payment_exceeds_balance' USING ERRCODE = '22023';
  END IF;

  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  INSERT INTO public.financial_payments (
    company_id, financial_entry_id, amount_cents, payment_method,
    paid_at, notes, idempotency_key, created_by
  ) VALUES (
    v_company_id, p_entry_id, p_amount_cents, p_payment_method,
    COALESCE(p_paid_at, now()), v_notes, p_idempotency_key, v_user_id
  )
  RETURNING id INTO v_payment_id;

  PERFORM private.sync_financial_entry_payment_status(p_entry_id);

  RETURN v_payment_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel_financial_payment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_financial_payment(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_payment record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT fp.id, fp.financial_entry_id
  INTO v_payment
  FROM public.financial_payments fp
  WHERE fp.id = p_payment_id
    AND fp.company_id = v_company_id
    AND fp.cancelled_at IS NULL;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'financial_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.financial_payments
  SET cancelled_at = now(), cancelled_by = v_user_id
  WHERE id = p_payment_id AND company_id = v_company_id;

  PERFORM private.sync_financial_entry_payment_status(v_payment.financial_entry_id);

  RETURN p_payment_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: mark_financial_entry_paid (compat — pagamento integral)
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
  v_entry record;
  v_remaining integer;
BEGIN
  SELECT fe.id, fe.amount_cents
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id AND fe.deleted_at IS NULL;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_remaining := v_entry.amount_cents - private.sum_active_financial_payments(p_entry_id);

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  RETURN public.record_financial_payment(
    p_entry_id,
    v_remaining,
    p_payment_method,
    p_paid_at,
    NULL,
    NULL
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: reopen_financial_entry
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reopen_financial_entry(p_entry_id uuid)
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

  SELECT fe.id, fe.status
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = v_company_id
    AND fe.deleted_at IS NULL;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.status NOT IN ('paid', 'partially_paid') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.financial_payments
  SET cancelled_at = now(), cancelled_by = v_user_id
  WHERE financial_entry_id = p_entry_id
    AND company_id = v_company_id
    AND cancelled_at IS NULL;

  UPDATE public.financial_entries
  SET status = 'pending', payment_method = NULL, paid_at = NULL
  WHERE id = p_entry_id AND company_id = v_company_id;

  RETURN p_entry_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: pagamentos para lançamentos já pagos
-- ---------------------------------------------------------------------------

INSERT INTO public.financial_payments (
  company_id,
  financial_entry_id,
  amount_cents,
  payment_method,
  paid_at,
  created_by,
  created_at
)
SELECT
  fe.company_id,
  fe.id,
  fe.amount_cents,
  fe.payment_method,
  COALESCE(fe.paid_at, fe.updated_at),
  fe.created_by,
  COALESCE(fe.paid_at, fe.created_at)
FROM public.financial_entries fe
WHERE fe.status = 'paid'
  AND fe.payment_method IS NOT NULL
  AND fe.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_payments fp
    WHERE fp.financial_entry_id = fe.id
      AND fp.cancelled_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- RPC: close_cash_closing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_cash_closing(
  p_business_date date,
  p_opening_balance_cents integer DEFAULT 0,
  p_actual_cash_cents integer DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_timezone text;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_closing_id uuid;
  v_total_received integer := 0;
  v_cash integer := 0;
  v_pix integer := 0;
  v_debit integer := 0;
  v_credit integer := 0;
  v_transfer integer := 0;
  v_other integer := 0;
  v_expense integer := 0;
  v_expected_cash integer;
  v_difference integer;
  v_notes text;
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
    SELECT 1 FROM public.cash_closings cc
    WHERE cc.company_id = v_company_id
      AND cc.business_date = p_business_date
      AND cc.closed_at IS NOT NULL
      AND cc.reopened_at IS NULL
  ) THEN
    RAISE EXCEPTION 'cash_closing_already_closed' USING ERRCODE = '22023';
  END IF;

  SELECT c.timezone INTO v_timezone FROM public.companies c WHERE c.id = v_company_id;
  v_day_start := timezone(v_timezone, p_business_date::timestamp);
  v_day_end := v_day_start + interval '1 day';

  SELECT
    COALESCE(SUM(fp.amount_cents), 0),
    COALESCE(SUM(fp.amount_cents) FILTER (WHERE fp.payment_method = 'cash'), 0),
    COALESCE(SUM(fp.amount_cents) FILTER (WHERE fp.payment_method = 'pix'), 0),
    COALESCE(SUM(fp.amount_cents) FILTER (WHERE fp.payment_method = 'debit_card'), 0),
    COALESCE(SUM(fp.amount_cents) FILTER (WHERE fp.payment_method = 'credit_card'), 0),
    COALESCE(SUM(fp.amount_cents) FILTER (WHERE fp.payment_method = 'bank_transfer'), 0),
    COALESCE(SUM(fp.amount_cents) FILTER (WHERE fp.payment_method = 'other'), 0)
  INTO v_total_received, v_cash, v_pix, v_debit, v_credit, v_transfer, v_other
  FROM public.financial_payments fp
  INNER JOIN public.financial_entries fe ON fe.id = fp.financial_entry_id
  WHERE fp.company_id = v_company_id
    AND fp.cancelled_at IS NULL
    AND fe.entry_type = 'income'
    AND fe.deleted_at IS NULL
    AND fp.paid_at >= v_day_start
    AND fp.paid_at < v_day_end;

  SELECT COALESCE(SUM(fp.amount_cents), 0)
  INTO v_expense
  FROM public.financial_payments fp
  INNER JOIN public.financial_entries fe ON fe.id = fp.financial_entry_id
  WHERE fp.company_id = v_company_id
    AND fp.cancelled_at IS NULL
    AND fe.entry_type = 'expense'
    AND fe.deleted_at IS NULL
    AND fp.paid_at >= v_day_start
    AND fp.paid_at < v_day_end;

  v_expected_cash := COALESCE(p_opening_balance_cents, 0) + v_cash;

  IF p_actual_cash_cents IS NOT NULL THEN
    v_difference := p_actual_cash_cents - v_expected_cash;
  ELSE
    v_difference := NULL;
  END IF;

  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  INSERT INTO public.cash_closings (
    company_id, business_date, closed_at, opening_balance_cents,
    expected_cash_cents, actual_cash_cents, difference_cents,
    total_received_cents, cash_received_cents, pix_received_cents,
    debit_received_cents, credit_received_cents, transfer_received_cents,
    other_received_cents, expense_paid_cents, net_balance_cents,
    notes, closed_by
  ) VALUES (
    v_company_id, p_business_date, now(), COALESCE(p_opening_balance_cents, 0),
    v_expected_cash, p_actual_cash_cents, v_difference,
    v_total_received, v_cash, v_pix, v_debit, v_credit, v_transfer, v_other,
    v_expense, v_total_received - v_expense,
    v_notes, v_user_id
  )
  RETURNING id INTO v_closing_id;

  RETURN v_closing_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: reopen_cash_closing (owner/admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reopen_cash_closing(p_closing_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT cm.role INTO v_role
  FROM public.company_members cm
  WHERE cm.company_id = v_company_id AND cm.user_id = v_user_id;

  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'insufficient_permissions' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cash_closings
  SET reopened_at = now(), reopened_by = v_user_id
  WHERE id = p_closing_id
    AND company_id = v_company_id
    AND closed_at IS NOT NULL
    AND reopened_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cash_closing_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN p_closing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_financial_payment(uuid, integer, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_financial_payment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_closing(date, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_cash_closing(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_financial_payment(uuid, integer, text, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_financial_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_closing(date, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_cash_closing(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Proteção de pagamentos (imutáveis após inserção, salvo estorno)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS financial_payments_prevent_company_change ON public.financial_payments;
CREATE TRIGGER financial_payments_prevent_company_change
  BEFORE UPDATE ON public.financial_payments
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

CREATE OR REPLACE FUNCTION private.protect_financial_payment_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'financial_payment_already_cancelled' USING ERRCODE = '22023';
  END IF;

  IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
    OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
    OR NEW.financial_entry_id IS DISTINCT FROM OLD.financial_entry_id
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  THEN
    RAISE EXCEPTION 'financial_payment_immutable' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_payments_protect_update ON public.financial_payments;
CREATE TRIGGER financial_payments_protect_update
  BEFORE UPDATE ON public.financial_payments
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_financial_payment_update();

-- ---------------------------------------------------------------------------
-- Venda de pacote: pagamento integral gera financial_payment
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
    'pending',
    'service_package',
    v_customer_package_id,
    v_description,
    'Pacotes',
    v_package.price_cents,
    v_due_date,
    NULL,
    NULL,
    v_user_id
  )
  RETURNING id INTO v_financial_entry_id;

  UPDATE public.customer_service_packages
  SET financial_entry_id = v_financial_entry_id
  WHERE id = v_customer_package_id AND company_id = v_company_id;

  IF p_financial_status = 'paid' THEN
    PERFORM public.record_financial_payment(
      v_financial_entry_id,
      v_package.price_cents,
      p_payment_method,
      now(),
      NULL,
      NULL
    );
  END IF;

  RETURN v_customer_package_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar lançamento também estorna pagamentos ativos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_financial_entry(p_entry_id uuid)
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

  UPDATE public.financial_payments
  SET cancelled_at = now(), cancelled_by = v_user_id
  WHERE financial_entry_id = p_entry_id
    AND company_id = v_company_id
    AND cancelled_at IS NULL;

  UPDATE public.financial_entries
  SET status = 'cancelled', cancelled_at = now(), payment_method = NULL, paid_at = NULL
  WHERE id = p_entry_id AND company_id = v_company_id;

  RETURN p_entry_id;
END;
$$;
