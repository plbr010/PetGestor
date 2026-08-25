-- PetGestor — finalizar PDV: pagamento adicional + sessão de caixa
-- Não edita migrations antigas. Devolução parcial de itens NÃO entra nesta etapa.

-- ---------------------------------------------------------------------------
-- Permissões novas (app-level; RLS usa membership)
-- ---------------------------------------------------------------------------
-- pos.receive_payment — registrar pagamento em venda parcial
-- pos.close_cash — abrir/fechar caixa do PDV (além de finance.close_cash legado)

-- ---------------------------------------------------------------------------
-- cash_sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  opened_by uuid NOT NULL REFERENCES auth.users (id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_balance_cents integer NOT NULL DEFAULT 0,
  closed_by uuid REFERENCES auth.users (id),
  closed_at timestamptz,
  counted_cash_cents integer,
  expected_cash_cents integer,
  difference_cents integer,
  notes text,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_sessions_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT cash_sessions_opening_balance_check CHECK (opening_balance_cents >= 0),
  CONSTRAINT cash_sessions_counted_check CHECK (
    counted_cash_cents IS NULL OR counted_cash_cents >= 0
  ),
  CONSTRAINT cash_sessions_closed_consistency CHECK (
    (status = 'open' AND closed_at IS NULL AND closed_by IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL
        AND counted_cash_cents IS NOT NULL AND expected_cash_cents IS NOT NULL
        AND difference_cents IS NOT NULL)
  ),
  CONSTRAINT cash_sessions_notes_length CHECK (
    notes IS NULL OR char_length(notes) <= 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_company_uidx
  ON public.cash_sessions (company_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS cash_sessions_company_opened_idx
  ON public.cash_sessions (company_id, opened_at DESC);

DROP TRIGGER IF EXISTS cash_sessions_set_updated_at ON public.cash_sessions;
CREATE TRIGGER cash_sessions_set_updated_at
  BEFORE UPDATE ON public.cash_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS cash_sessions_prevent_company_change ON public.cash_sessions;
CREATE TRIGGER cash_sessions_prevent_company_change
  BEFORE UPDATE ON public.cash_sessions
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_sessions_select_member ON public.cash_sessions;
CREATE POLICY cash_sessions_select_member
  ON public.cash_sessions FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS cash_sessions_insert_member ON public.cash_sessions;
CREATE POLICY cash_sessions_insert_member
  ON public.cash_sessions FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS cash_sessions_update_member ON public.cash_sessions;
CREATE POLICY cash_sessions_update_member
  ON public.cash_sessions FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.cash_sessions TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: register_sale_payment (pagamento adicional em venda parcial)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_sale_payment(
  p_sale_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_idempotency_key text,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_sale record;
  v_remaining integer;
  v_paid integer;
  v_status text;
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

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN (
    'cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  v_paid_at := coalesce(p_paid_at, now());

  -- Idempotência: pagamento já registrado
  SELECT id INTO v_existing
  FROM public.financial_payments
  WHERE company_id = v_company_id
    AND idempotency_key = p_idempotency_key
    AND cancelled_at IS NULL
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'sale_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_sale.cancelled_at IS NOT NULL OR v_sale.status = 'cancelled' THEN
    RAISE EXCEPTION 'sale_already_cancelled' USING ERRCODE = '22023';
  END IF;

  IF v_sale.status NOT IN ('partially_paid', 'completed') THEN
    RAISE EXCEPTION 'invalid_sale_status' USING ERRCODE = '22023';
  END IF;

  IF v_sale.financial_entry_id IS NULL THEN
    RAISE EXCEPTION 'sale_missing_financial_entry' USING ERRCODE = '22023';
  END IF;

  IF v_sale.status = 'completed' AND v_sale.paid_cents >= v_sale.total_cents THEN
    RAISE EXCEPTION 'sale_already_paid' USING ERRCODE = '22023';
  END IF;

  v_remaining := v_sale.total_cents - v_sale.paid_cents;
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'sale_already_paid' USING ERRCODE = '22023';
  END IF;

  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'payment_exceeds_balance' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.financial_payments (
    company_id, financial_entry_id, amount_cents, payment_method,
    paid_at, idempotency_key, created_by
  ) VALUES (
    v_company_id, v_sale.financial_entry_id, p_amount_cents, p_payment_method,
    v_paid_at, p_idempotency_key, v_user_id
  )
  RETURNING id INTO v_payment_id;

  v_paid := v_sale.paid_cents + p_amount_cents;
  IF v_paid > v_sale.total_cents THEN
    RAISE EXCEPTION 'payment_exceeds_balance' USING ERRCODE = '22023';
  END IF;

  IF v_paid >= v_sale.total_cents THEN
    v_status := 'completed';
  ELSE
    v_status := 'partially_paid';
  END IF;

  UPDATE public.sales
  SET paid_cents = v_paid, status = v_status
  WHERE id = p_sale_id;

  PERFORM private.sync_financial_entry_payment_status(v_sale.financial_entry_id);

  RETURN v_payment_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing
    FROM public.financial_payments
    WHERE company_id = v_company_id
      AND idempotency_key = p_idempotency_key
      AND cancelled_at IS NULL
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.register_sale_payment(uuid, integer, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_sale_payment(uuid, integer, text, text, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: open_cash_session
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_opening_balance_cents integer DEFAULT 0,
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
  v_existing uuid;
  v_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF p_opening_balance_cents IS NULL OR p_opening_balance_cents < 0 THEN
    RAISE EXCEPTION 'invalid_opening_balance' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing
  FROM public.cash_sessions
  WHERE company_id = v_company_id AND status = 'open'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'cash_session_already_open' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cash_sessions (
    company_id, status, opened_by, opening_balance_cents, notes
  ) VALUES (
    v_company_id, 'open', v_user_id, p_opening_balance_cents,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_cash_session(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_cash_session(integer, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: close_cash_session
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id uuid,
  p_counted_cash_cents integer,
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
  v_session record;
  v_cash integer := 0;
  v_pix integer := 0;
  v_debit integer := 0;
  v_credit integer := 0;
  v_transfer integer := 0;
  v_other integer := 0;
  v_expected integer;
  v_diff integer;
  v_summary jsonb;
  v_row record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF p_counted_cash_cents IS NULL OR p_counted_cash_cents < 0 THEN
    RAISE EXCEPTION 'invalid_counted_cash' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'cash_session_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'cash_session_already_closed' USING ERRCODE = '22023';
  END IF;

  -- Soma pagamentos ATIVOS no período da sessão (valor efetivamente recebido)
  FOR v_row IN
    SELECT fp.payment_method, coalesce(sum(fp.amount_cents), 0)::integer AS total_cents
    FROM public.financial_payments fp
    JOIN public.financial_entries fe
      ON fe.id = fp.financial_entry_id AND fe.company_id = fp.company_id
    WHERE fp.company_id = v_company_id
      AND fp.cancelled_at IS NULL
      AND fe.source_type = 'sale'
      AND fp.paid_at >= v_session.opened_at
      AND fp.paid_at <= now()
    GROUP BY fp.payment_method
  LOOP
    IF v_row.payment_method = 'cash' THEN v_cash := v_row.total_cents;
    ELSIF v_row.payment_method = 'pix' THEN v_pix := v_row.total_cents;
    ELSIF v_row.payment_method = 'debit_card' THEN v_debit := v_row.total_cents;
    ELSIF v_row.payment_method = 'credit_card' THEN v_credit := v_row.total_cents;
    ELSIF v_row.payment_method = 'bank_transfer' THEN v_transfer := v_row.total_cents;
    ELSE v_other := v_other + v_row.total_cents;
    END IF;
  END LOOP;

  -- Dinheiro físico esperado = saldo inicial + entradas em dinheiro no período
  v_expected := v_session.opening_balance_cents + v_cash;
  v_diff := p_counted_cash_cents - v_expected;

  v_summary := jsonb_build_object(
    'cash', v_cash,
    'pix', v_pix,
    'debit_card', v_debit,
    'credit_card', v_credit,
    'bank_transfer', v_transfer,
    'other', v_other,
    'opening_balance_cents', v_session.opening_balance_cents,
    'expected_cash_cents', v_expected,
    'counted_cash_cents', p_counted_cash_cents,
    'difference_cents', v_diff
  );

  UPDATE public.cash_sessions
  SET
    status = 'closed',
    closed_by = v_user_id,
    closed_at = now(),
    counted_cash_cents = p_counted_cash_cents,
    expected_cash_cents = v_expected,
    difference_cents = v_diff,
    summary = v_summary,
    notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
  WHERE id = p_session_id;

  RETURN p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_session(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, integer, text) TO authenticated;
