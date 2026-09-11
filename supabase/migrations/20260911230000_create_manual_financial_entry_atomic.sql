-- PetGestor — hardening BLOCO 5: criação manual atômica (entry + payment).
-- Incremental. Não edita migrations dos BLOCOs 1–5.
-- Não inicia BLOCO 6 (PDV). Não apaga pagamentos. Não desabilita RLS.
--
-- Causa: createManualEntry fazia INSERT pending e, se o usuário pedia paid,
-- chamava mark_financial_entry_paid numa segunda round-trip. Timeout/erro na
-- etapa 2 deixava o lançamento pending embora o pedido fosse paid.
--
-- Correção: uma RPC, uma transação. RAISE após o INSERT aborta tudo.

-- ---------------------------------------------------------------------------
-- 1. Chave de idempotência da criação (não só do pagamento)
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.financial_entries.idempotency_key IS
  'Chave da tentativa de criação manual. Única por empresa enquanto a entry não está deleted. Retry com a mesma chave e o mesmo payload devolve a entry original.';

CREATE UNIQUE INDEX IF NOT EXISTS financial_entries_company_idempotency_key_uidx
  ON public.financial_entries (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Comparação de payload para replay / conflito
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.assert_manual_entry_idempotency_payload(
  p_entry_id uuid,
  p_company_id uuid,
  p_entry_type text,
  p_description text,
  p_category text,
  p_amount_cents integer,
  p_due_date date,
  p_notes text,
  p_desired_status text,
  p_payment_method text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_entry record;
BEGIN
  SELECT
    fe.id,
    fe.source_type,
    fe.entry_type,
    fe.description,
    fe.category,
    fe.amount_cents,
    fe.due_date,
    fe.notes,
    fe.status,
    fe.payment_method
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = p_company_id
    AND fe.deleted_at IS NULL
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'financial_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.source_type IS DISTINCT FROM 'manual'
    OR v_entry.entry_type IS DISTINCT FROM p_entry_type
    OR btrim(v_entry.description) IS DISTINCT FROM btrim(p_description)
    OR nullif(btrim(coalesce(v_entry.category, '')), '')
         IS DISTINCT FROM nullif(btrim(coalesce(p_category, '')), '')
    OR v_entry.amount_cents IS DISTINCT FROM p_amount_cents
    OR v_entry.due_date IS DISTINCT FROM p_due_date
    OR nullif(btrim(coalesce(v_entry.notes, '')), '')
         IS DISTINCT FROM nullif(btrim(coalesce(p_notes, '')), '')
    OR (p_desired_status = 'pending' AND v_entry.status IS DISTINCT FROM 'pending')
    OR (p_desired_status = 'paid' AND v_entry.status IS DISTINCT FROM 'paid')
    OR (p_desired_status = 'paid' AND v_entry.payment_method IS DISTINCT FROM p_payment_method)
  THEN
    RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_manual_entry_idempotency_payload(
  uuid, uuid, text, text, text, integer, date, text, text, text
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Criação transacional
--    pending → só financial_entry
--    paid    → entry pending + financial_payment canônico + status derivado
--    INSERT começa pending para o trigger ensure_manual_paid_has_payment
--    (AFTER INSERT de manuais já paid) não duplicar parcela.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.create_manual_financial_entry(
  p_entry_type text,
  p_description text,
  p_category text,
  p_amount_cents integer,
  p_due_date date,
  p_notes text,
  p_desired_status text,
  p_payment_method text,
  p_paid_at timestamptz,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_key text;
  v_description text;
  v_category text;
  v_notes text;
  v_existing_id uuid;
  v_entry_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  v_key := nullif(btrim(p_idempotency_key), '');
  IF v_key IS NULL OR char_length(v_key) < 8 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  IF p_entry_type IS NULL OR p_entry_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'invalid_entry_type' USING ERRCODE = '22023';
  END IF;

  v_description := btrim(coalesce(p_description, ''));
  IF char_length(v_description) < 2 OR char_length(v_description) > 160 THEN
    RAISE EXCEPTION 'invalid_description' USING ERRCODE = '22023';
  END IF;

  v_category := nullif(btrim(coalesce(p_category, '')), '');
  IF v_category IS NOT NULL AND char_length(v_category) > 80 THEN
    RAISE EXCEPTION 'invalid_category' USING ERRCODE = '22023';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > 99999999 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  IF v_notes IS NOT NULL AND char_length(v_notes) > 3000 THEN
    RAISE EXCEPTION 'invalid_notes' USING ERRCODE = '22023';
  END IF;

  IF p_desired_status IS NULL OR p_desired_status NOT IN ('pending', 'paid') THEN
    RAISE EXCEPTION 'invalid_desired_status' USING ERRCODE = '22023';
  END IF;

  IF p_desired_status = 'paid' THEN
    IF p_payment_method IS NULL OR p_payment_method NOT IN (
      'cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other'
    ) THEN
      RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
    END IF;
  ELSIF p_payment_method IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  -- due_date é date civil. Não converter via timestamptz / new Date().

  SELECT fe.id
  INTO v_existing_id
  FROM public.financial_entries fe
  WHERE fe.company_id = v_company_id
    AND fe.idempotency_key = v_key
    AND fe.deleted_at IS NULL
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    PERFORM private.assert_manual_entry_idempotency_payload(
      v_existing_id,
      v_company_id,
      p_entry_type,
      v_description,
      v_category,
      p_amount_cents,
      p_due_date,
      v_notes,
      p_desired_status,
      p_payment_method
    );
    RETURN v_existing_id;
  END IF;

  BEGIN
    INSERT INTO public.financial_entries (
      company_id,
      entry_type,
      status,
      source_type,
      description,
      category,
      amount_cents,
      due_date,
      payment_method,
      paid_at,
      notes,
      created_by,
      idempotency_key
    ) VALUES (
      v_company_id,
      p_entry_type,
      'pending',
      'manual',
      v_description,
      v_category,
      p_amount_cents,
      p_due_date,
      NULL,
      NULL,
      v_notes,
      v_user_id,
      v_key
    )
    RETURNING id INTO v_entry_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT fe.id
      INTO v_existing_id
      FROM public.financial_entries fe
      WHERE fe.company_id = v_company_id
        AND fe.idempotency_key = v_key
        AND fe.deleted_at IS NULL
      FOR UPDATE;

      IF v_existing_id IS NULL THEN
        RAISE;
      END IF;

      PERFORM private.assert_manual_entry_idempotency_payload(
        v_existing_id,
        v_company_id,
        p_entry_type,
        v_description,
        v_category,
        p_amount_cents,
        p_due_date,
        v_notes,
        p_desired_status,
        p_payment_method
      );
      RETURN v_existing_id;
  END;

  -- Sem EXCEPTION aqui: falha ao criar o payment (RPC, teto, método, etc.)
  -- aborta a transação da função — a entry pending não persiste.
  IF p_desired_status = 'paid' THEN
    PERFORM private.register_financial_payment(
      v_entry_id,
      p_payment_method,
      p_amount_cents,
      p_paid_at,
      'manual-create:' || v_key
    );
  END IF;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION private.create_manual_financial_entry(
  text, text, text, integer, date, text, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_manual_financial_entry(
  p_entry_type text,
  p_description text,
  p_category text DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_desired_status text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
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
  RETURN private.create_manual_financial_entry(
    p_entry_type,
    p_description,
    p_category,
    p_amount_cents,
    p_due_date,
    p_notes,
    p_desired_status,
    p_payment_method,
    p_paid_at,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_financial_entry(
  text, text, text, integer, date, text, text, text, timestamptz, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_manual_financial_entry(
  text, text, text, integer, date, text, text, text, timestamptz, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.create_manual_financial_entry(
  text, text, text, integer, date, text, text, text, timestamptz, text, uuid
) IS
  'Cria lançamento manual numa única transação. pending: só entry. paid: entry + payment canônico + status derivado. Idempotente por (company_id, idempotency_key).';
