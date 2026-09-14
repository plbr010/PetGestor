-- PetGestor — BLOCO 8.1: atomicidade serviço + preços + ficha de produtos.
-- Incremental. Não edita migrations já aplicadas (BLOCOs 1–9).
-- Não inicia BLOCO 10. Não altera billing/Mercado Pago/PDV/financeiro/agenda.
--
-- Causa: createServiceAction / updateServiceAction chamavam
--   create/update_service_with_prices
-- e, numa segunda round-trip,
--   replace_service_product_recipes.
-- Falha na ficha deixava serviço/preços já commitados.
--
-- Correção: uma RPC, uma transação PostgreSQL. RAISE aborta core + preços + ficha.

-- ---------------------------------------------------------------------------
-- 1. Tentativas de mutação (idempotência por empresa + operação + chave)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS private.service_mutation_attempts (
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('create', 'update')),
  idempotency_key text NOT NULL,
  payload_fingerprint text NOT NULL,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, operation, idempotency_key)
);

COMMENT ON TABLE private.service_mutation_attempts IS
  'Replay de create/update de serviço. Mesma chave + mesmo fingerprint → mesmo service_id. Payload diferente → conflito.';

ALTER TABLE private.service_mutation_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.service_mutation_attempts FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fingerprint canônico (ordem da ficha/portes irrelevante)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.service_mutation_fingerprint(
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb,
  p_items jsonb
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT md5(
    jsonb_build_object(
      'name', btrim(p_name),
      'description', nullif(btrim(coalesce(p_description, '')), ''),
      'pricing_mode', p_pricing_mode,
      'price_cents', p_price_cents,
      'duration_minutes', p_duration_minutes,
      'active', coalesce(p_active, true),
      'size_prices', (
        SELECT coalesce(
          jsonb_agg(
            jsonb_build_object(
              'size', item->>'size',
              'price_cents', (item->>'price_cents')::integer,
              'duration_minutes', (item->>'duration_minutes')::integer
            )
            ORDER BY item->>'size'
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(CASE
          WHEN p_size_prices IS NULL OR jsonb_typeof(p_size_prices) <> 'array' THEN '[]'::jsonb
          ELSE p_size_prices
        END) AS item
      ),
      'items', (
        SELECT coalesce(
          jsonb_agg(
            jsonb_build_object(
              'product_id', (item->>'product_id'),
              'quantity', round((item->>'quantity')::numeric, 3)
            )
            ORDER BY item->>'product_id'
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(CASE
          WHEN p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN '[]'::jsonb
          ELSE p_items
        END) AS item
      )
    )::text
  );
$$;

REVOKE ALL ON FUNCTION private.service_mutation_fingerprint(
  text, text, text, integer, integer, boolean, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Replay / conflito da chave de idempotência
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
    IF v_existing.payload_fingerprint IS DISTINCT FROM p_fingerprint THEN
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

    IF v_existing.payload_fingerprint IS DISTINCT FROM p_fingerprint THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
    END IF;

    RETURN v_existing.service_id;
END;
$$;

REVOKE ALL ON FUNCTION private.remember_service_mutation_attempt(
  uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.peek_service_mutation_attempt(
  p_company_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_fingerprint text
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

  RETURN v_existing.service_id;
END;
$$;

REVOKE ALL ON FUNCTION private.peek_service_mutation_attempt(
  uuid, text, text, text
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. CREATE atômico (core + preços + ficha)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.create_service_with_prices_and_recipes(
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
  v_service_id uuid;
BEGIN
  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_company_id::text || ':service:create:' || v_key, 0)
  );

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
    v_company_id, 'create', v_key, v_fingerprint
  );
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_service_id := private.create_service_with_prices(
    p_name,
    p_description,
    p_pricing_mode,
    p_price_cents,
    p_duration_minutes,
    p_active,
    p_size_prices
  );

  PERFORM private.replace_service_product_recipes(v_service_id, coalesce(p_items, '[]'::jsonb));

  RETURN private.remember_service_mutation_attempt(
    v_company_id, 'create', v_key, v_fingerprint, v_service_id
  );
END;
$$;

REVOKE ALL ON FUNCTION private.create_service_with_prices_and_recipes(
  text, text, text, integer, integer, boolean, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. UPDATE atômico (lock do serviço + core + preços + ficha)
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
    v_company_id, 'update', v_key, v_fingerprint
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

-- ---------------------------------------------------------------------------
-- 6. Wrappers públicos — mesma transação, tenant explícito, services.manage
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_service_with_prices(
  text, text, text, integer, integer, boolean, jsonb, uuid
);

CREATE FUNCTION public.create_service_with_prices(
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean DEFAULT true,
  p_size_prices jsonb DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
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
  PERFORM private.require_app_permission(p_company_id, 'services.manage');
  RETURN private.create_service_with_prices_and_recipes(
    p_name,
    p_description,
    p_pricing_mode,
    p_price_cents,
    p_duration_minutes,
    p_active,
    p_size_prices,
    p_items,
    p_idempotency_key
  );
END;
$$;

COMMENT ON FUNCTION public.create_service_with_prices(
  text, text, text, integer, integer, boolean, jsonb, jsonb, text, uuid
) IS
  'Cria serviço + preços + ficha de produtos numa única transação. Falha na ficha desfaz o serviço.';

REVOKE ALL ON FUNCTION public.create_service_with_prices(
  text, text, text, integer, integer, boolean, jsonb, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_service_with_prices(
  text, text, text, integer, integer, boolean, jsonb, jsonb, text, uuid
) TO authenticated;

DROP FUNCTION IF EXISTS public.update_service_with_prices(
  uuid, text, text, text, integer, integer, boolean, jsonb, uuid
);

CREATE FUNCTION public.update_service_with_prices(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
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
  PERFORM private.require_app_permission(p_company_id, 'services.manage');
  RETURN private.update_service_with_prices_and_recipes(
    p_service_id,
    p_name,
    p_description,
    p_pricing_mode,
    p_price_cents,
    p_duration_minutes,
    p_active,
    p_size_prices,
    p_items,
    p_idempotency_key
  );
END;
$$;

COMMENT ON FUNCTION public.update_service_with_prices(
  uuid, text, text, text, integer, integer, boolean, jsonb, jsonb, text, uuid
) IS
  'Atualiza serviço + preços + ficha numa única transação. FOR UPDATE + advisory lock. Lista vazia limpa a ficha.';

REVOKE ALL ON FUNCTION public.update_service_with_prices(
  uuid, text, text, text, integer, integer, boolean, jsonb, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_service_with_prices(
  uuid, text, text, text, integer, integer, boolean, jsonb, jsonb, text, uuid
) TO authenticated;
