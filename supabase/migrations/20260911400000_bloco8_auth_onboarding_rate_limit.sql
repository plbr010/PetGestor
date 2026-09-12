-- PetGestor BLOCO 8 — onboarding atômico + rate limit persistente.
-- Incremental. Não edita migrations anteriores. Não desabilita RLS.
-- Trial continua a ser criado pelo trigger canônico em companies
-- (private.create_company_subscription) — duração/plano NÃO mudam aqui.

-- ---------------------------------------------------------------------------
-- complete_onboarding: lock por auth.uid(), membership ativa vs revogada
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_full_name text,
  p_company_name text,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_active_company_id uuid;
  v_revoked_exists boolean;
  v_full_name text;
  v_company_name text;
  v_phone text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

  -- Serializa onboarding do mesmo usuário na transação (duplo clique / retry / concorrência).
  PERFORM pg_advisory_xact_lock(87112008, hashtext(v_user_id::text));

  v_full_name := trim(p_full_name);
  v_company_name := trim(p_company_name);
  v_phone := NULLIF(trim(p_phone), '');

  IF char_length(v_full_name) < 2 OR char_length(v_full_name) > 120 THEN
    RAISE EXCEPTION 'invalid_full_name'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(v_company_name) < 2 OR char_length(v_company_name) > 120 THEN
    RAISE EXCEPTION 'invalid_company_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND v_phone !~ '^\+55[1-9][0-9]{9,10}$' THEN
    RAISE EXCEPTION 'invalid_phone'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (v_user_id, v_full_name, v_phone)
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();

  SELECT cm.company_id
  INTO v_active_company_id
  FROM public.company_members cm
  WHERE cm.user_id = v_user_id
    AND cm.access_revoked_at IS NULL
  ORDER BY cm.updated_at DESC NULLS LAST, cm.created_at DESC
  LIMIT 1;

  IF v_active_company_id IS NOT NULL THEN
    RETURN v_active_company_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.user_id = v_user_id
      AND cm.access_revoked_at IS NOT NULL
  )
  INTO v_revoked_exists;

  IF v_revoked_exists THEN
    RAISE EXCEPTION 'membership_revoked'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.companies (name, created_by)
  VALUES (v_company_name, v_user_id)
  RETURNING id INTO v_company_id;

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (v_company_id, v_user_id, 'owner');

  -- Trial/subscription: trigger AFTER INSERT em companies
  -- (private.create_company_subscription, ON CONFLICT DO NOTHING).

  RETURN v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Rate limit atômico (janela fixa + advisory lock + UPSERT)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS private.auth_rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_rate_limit_buckets_key_length CHECK (
    char_length(bucket_key) BETWEEN 16 AND 128
  )
);

COMMENT ON TABLE private.auth_rate_limit_buckets IS
  'Contadores de rate limit de auth. bucket_key é hash (ação + sujeito + origem), nunca senha/e-mail em claro.';

CREATE INDEX IF NOT EXISTS auth_rate_limit_buckets_window_idx
  ON private.auth_rate_limit_buckets (window_started_at);

CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
SET row_security = off
AS $$
DECLARE
  v_row private.auth_rate_limit_buckets%ROWTYPE;
  v_allowed boolean;
  v_retry_after integer;
  v_remaining integer;
  v_elapsed integer;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid_rate_limit_params'
      USING ERRCODE = '22023';
  END IF;

  IF p_bucket_key IS NULL OR char_length(p_bucket_key) < 16 OR char_length(p_bucket_key) > 128 THEN
    RAISE EXCEPTION 'invalid_rate_limit_key'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(87112009, hashtext(p_bucket_key));

  INSERT INTO private.auth_rate_limit_buckets AS b (
    bucket_key,
    window_started_at,
    hit_count,
    updated_at
  )
  VALUES (
    p_bucket_key,
    p_now,
    1,
    p_now
  )
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    window_started_at = CASE
      WHEN b.window_started_at + make_interval(secs => p_window_seconds) <= EXCLUDED.window_started_at
        THEN EXCLUDED.window_started_at
      ELSE b.window_started_at
    END,
    hit_count = CASE
      WHEN b.window_started_at + make_interval(secs => p_window_seconds) <= EXCLUDED.window_started_at
        THEN 1
      ELSE b.hit_count + 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_row;

  v_allowed := v_row.hit_count <= p_limit;
  v_elapsed := GREATEST(
    0,
    FLOOR(EXTRACT(EPOCH FROM (p_now - v_row.window_started_at)))::integer
  );
  v_retry_after := GREATEST(0, p_window_seconds - v_elapsed);
  v_remaining := GREATEST(0, p_limit - v_row.hit_count);

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', p_limit,
    'remaining', v_remaining,
    'retry_after_seconds', CASE WHEN v_allowed THEN 0 ELSE v_retry_after END,
    'hit_count', v_row.hit_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(text, integer, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(text, integer, integer, timestamptz) TO anon, authenticated;

COMMENT ON FUNCTION public.consume_auth_rate_limit(text, integer, integer, timestamptz) IS
  'Consome 1 hit de rate limit de forma atômica. bucket_key deve ser hash opaco gerado no servidor.';
