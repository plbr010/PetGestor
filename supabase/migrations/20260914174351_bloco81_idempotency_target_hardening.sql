-- PetGestor — BLOCO 8.1 hardening: idempotência de UPDATE inclui o serviço alvo.
-- Incremental. NÃO edita 20260914172942_bloco81_service_prices_recipe_atomic.sql.
-- Não inicia BLOCO 10. Não altera billing/Mercado Pago/auth/agenda/PDV/financeiro.
--
-- Bug: private.service_mutation_attempts PK (company_id, operation, idempotency_key)
-- e o fingerprint de UPDATE não incluem p_service_id. Replay da key K + payload P
-- no serviço B podia devolver o service_id de A sem atualizar B.
--
-- Correção: peek/remember de UPDATE exigem que a tentativa existente seja do
-- MESMO service_id. Tentativa de outro serviço → idempotency_key_conflict.
-- CREATE permanece (company, operation, key) + fingerprint do payload.
-- Attempts já gravadas são preservadas (sem DROP TABLE / sem rehash).

COMMENT ON TABLE private.service_mutation_attempts IS
  'Replay de create/update. CREATE: (empresa, create, key) + fingerprint. UPDATE: o mesmo E o service_id da tentativa deve ser o alvo. Key reusada em outro serviço → conflito.';

-- ---------------------------------------------------------------------------
-- peek: CREATE ignora alvo; UPDATE exige service_id igual ao armazenado
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS private.peek_service_mutation_attempt(uuid, text, text, text);

CREATE FUNCTION private.peek_service_mutation_attempt(
  p_company_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_fingerprint text,
  p_expected_service_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_existing private.service_mutation_attempts%ROWTYPE;
BEGIN
  SELECT *
  INTO v_existing
  FROM private.service_mutation_attempts
  WHERE company_id = p_company_id
    AND operation = p_operation
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_existing.payload_fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
  END IF;

  IF p_expected_service_id IS NOT NULL
    AND v_existing.service_id IS DISTINCT FROM p_expected_service_id THEN
    RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
  END IF;

  RETURN v_existing.service_id;
END;
$$;

REVOKE ALL ON FUNCTION private.peek_service_mutation_attempt(
  uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- remember: unique_violation / linha existente também valida o service_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.remember_service_mutation_attempt(
  p_company_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_fingerprint text,
  p_service_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_existing private.service_mutation_attempts%ROWTYPE;
BEGIN
  SELECT *
  INTO v_existing
  FROM private.service_mutation_attempts
  WHERE company_id = p_company_id
    AND operation = p_operation
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM p_fingerprint
      OR v_existing.service_id IS DISTINCT FROM p_service_id THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing.service_id;
  END IF;

  INSERT INTO private.service_mutation_attempts (
    company_id, operation, idempotency_key, payload_fingerprint, service_id
  ) VALUES (
    p_company_id, p_operation, p_idempotency_key, p_fingerprint, p_service_id
  );

  RETURN p_service_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
    INTO v_existing
    FROM private.service_mutation_attempts
    WHERE company_id = p_company_id
      AND operation = p_operation
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF v_existing.payload_fingerprint IS DISTINCT FROM p_fingerprint
      OR v_existing.service_id IS DISTINCT FROM p_service_id THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
    END IF;

    RETURN v_existing.service_id;
END;
$$;

REVOKE ALL ON FUNCTION private.remember_service_mutation_attempt(
  uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- UPDATE: lock da key + lock do serviço; peek com alvo explícito
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.update_service_with_prices_and_recipes(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb,
  p_items jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_company_id uuid;
  v_key text;
  v_fingerprint text;
  v_existing uuid;
  v_locked uuid;
BEGIN
  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  -- 1) serializa a mesma idempotency key (A vs B com a mesma K não intercalam replay)
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_company_id::text || ':service:update-key:' || v_key, 0)
  );
  -- 2) serializa o serviço alvo (core + size_prices + recipes até o COMMIT)
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_company_id::text || ':service:update:' || p_service_id::text, 0)
  );

  SELECT s.id
  INTO v_locked
  FROM public.services s
  WHERE s.id = p_service_id
    AND s.company_id = v_company_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF v_locked IS NULL THEN
    RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_fingerprint := private.service_mutation_fingerprint(
    p_name,
    p_description,
    p_pricing_mode,
    p_price_cents,
    p_duration_minutes,
    p_active,
    p_size_prices,
    p_items
  );

  v_existing := private.peek_service_mutation_attempt(
    v_company_id,
    'update',
    v_key,
    v_fingerprint,
    p_service_id
  );
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM private.update_service_with_prices(
    p_service_id,
    p_name,
    p_description,
    p_pricing_mode,
    p_price_cents,
    p_duration_minutes,
    p_active,
    p_size_prices
  );

  PERFORM private.replace_service_product_recipes(p_service_id, coalesce(p_items, '[]'::jsonb));

  RETURN private.remember_service_mutation_attempt(
    v_company_id, 'update', v_key, v_fingerprint, p_service_id
  );
END;
$$;

REVOKE ALL ON FUNCTION private.update_service_with_prices_and_recipes(
  uuid, text, text, text, integer, integer, boolean, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.update_service_with_prices_and_recipes(
  uuid, text, text, text, integer, integer, boolean, jsonb, jsonb, text
) IS
  'UPDATE atômico. Replay só se a tentativa existente for do mesmo service_id. Key reusada em outro serviço → conflito.';
