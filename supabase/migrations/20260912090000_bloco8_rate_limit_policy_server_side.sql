-- PetGestor BLOCO 8 hardening — política de rate limit só no banco.
-- Incremental. Não edita 20260911400000. Preserva buckets existentes.
-- O caller não envia limit, window nem relógio.

-- ---------------------------------------------------------------------------
-- Revoga/remove a API antiga (limit/window/now controláveis pelo caller)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(text, integer, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(text, integer, integer, timestamptz) FROM anon, authenticated;

DROP FUNCTION IF EXISTS public.consume_auth_rate_limit(text, integer, integer, timestamptz);

-- ---------------------------------------------------------------------------
-- Política interna (não exposta)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.auth_rate_limit_policy(p_action text)
RETURNS TABLE (hit_limit integer, window_seconds integer)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = private
AS $$
BEGIN
  CASE p_action
    WHEN 'login' THEN
      hit_limit := 8;
      window_seconds := 15 * 60;
    WHEN 'signup' THEN
      hit_limit := 5;
      window_seconds := 15 * 60;
    WHEN 'recovery' THEN
      hit_limit := 5;
      window_seconds := 15 * 60;
    WHEN 'resend_confirmation' THEN
      hit_limit := 3;
      window_seconds := 15 * 60;
    WHEN 'invite' THEN
      hit_limit := 10;
      window_seconds := 15 * 60;
    WHEN 'invite_lookup' THEN
      hit_limit := 10;
      window_seconds := 15 * 60;
    ELSE
      RAISE EXCEPTION 'invalid_rate_limit_action'
        USING ERRCODE = '22023';
  END CASE;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.auth_rate_limit_policy(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- API pública: apenas action allowlisted + bucket hash opaco
-- Relógio: now() do banco. Política: private.auth_rate_limit_policy.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit(
  p_action text,
  p_bucket_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
SET row_security = off
AS $$
DECLARE
  v_policy record;
  v_now timestamptz;
  v_row private.auth_rate_limit_buckets%ROWTYPE;
  v_allowed boolean;
  v_retry_after integer;
  v_remaining integer;
  v_elapsed integer;
BEGIN
  SELECT p.hit_limit, p.window_seconds
  INTO v_policy
  FROM private.auth_rate_limit_policy(p_action) AS p;

  IF v_policy.hit_limit IS NULL OR v_policy.window_seconds IS NULL THEN
    RAISE EXCEPTION 'invalid_rate_limit_action'
      USING ERRCODE = '22023';
  END IF;

  IF p_bucket_key IS NULL OR char_length(p_bucket_key) < 16 OR char_length(p_bucket_key) > 128 THEN
    RAISE EXCEPTION 'invalid_rate_limit_key'
      USING ERRCODE = '22023';
  END IF;

  v_now := now();

  PERFORM pg_advisory_xact_lock(87112009, hashtext(p_bucket_key));

  INSERT INTO private.auth_rate_limit_buckets AS b (
    bucket_key,
    window_started_at,
    hit_count,
    updated_at
  )
  VALUES (
    p_bucket_key,
    v_now,
    1,
    v_now
  )
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    window_started_at = CASE
      WHEN b.window_started_at + make_interval(secs => v_policy.window_seconds) <= EXCLUDED.window_started_at
        THEN EXCLUDED.window_started_at
      ELSE b.window_started_at
    END,
    hit_count = CASE
      WHEN b.window_started_at + make_interval(secs => v_policy.window_seconds) <= EXCLUDED.window_started_at
        THEN 1
      ELSE b.hit_count + 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_row;

  v_allowed := v_row.hit_count <= v_policy.hit_limit;
  v_elapsed := GREATEST(
    0,
    FLOOR(EXTRACT(EPOCH FROM (v_now - v_row.window_started_at)))::integer
  );
  v_retry_after := GREATEST(0, v_policy.window_seconds - v_elapsed);
  v_remaining := GREATEST(0, v_policy.hit_limit - v_row.hit_count);

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', v_policy.hit_limit,
    'remaining', v_remaining,
    'retry_after_seconds', CASE WHEN v_allowed THEN 0 ELSE v_retry_after END,
    'hit_count', v_row.hit_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.consume_auth_rate_limit(text, text) IS
  'Consome 1 hit de rate limit. p_action é allowlist fechada; p_bucket_key é hash opaco. limit/window/now nunca vêm do caller.';
