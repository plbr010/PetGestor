-- PetGestor BLOCO 8 hardening final.
-- Incremental. Não edita 20260911400000 nem 20260912090000.
-- 1) Rate limit: primitive só via service_role + limpeza oportunística.
-- 2) Recovery marker one-time em schema privado (hash, não token puro).

-- ---------------------------------------------------------------------------
-- Rate limit: revoga superfície pública
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(text, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Limpeza oportunística de buckets expirados (não toca janela ativa)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cleanup_auth_rate_limit_buckets()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = private
AS $$
  DELETE FROM private.auth_rate_limit_buckets
  WHERE updated_at < now() - interval '2 hours';
$$;

REVOKE ALL ON FUNCTION private.cleanup_auth_rate_limit_buckets() FROM PUBLIC;

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

  PERFORM private.cleanup_auth_rate_limit_buckets();

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
REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(text, text) TO service_role;

COMMENT ON FUNCTION public.consume_auth_rate_limit(text, text) IS
  'SERVER-ONLY (service_role). Consome 1 hit. limit/window/now nunca vêm do caller.';

-- ---------------------------------------------------------------------------
-- Recovery marker one-time (hash no banco, token só no cookie)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS private.password_recovery_markers (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS password_recovery_markers_user_unconsumed_idx
  ON private.password_recovery_markers (user_id)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS password_recovery_markers_expires_idx
  ON private.password_recovery_markers (expires_at);

ALTER TABLE private.password_recovery_markers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.password_recovery_markers FROM PUBLIC;
REVOKE ALL ON TABLE private.password_recovery_markers FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.cleanup_password_recovery_markers()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = private
AS $$
  DELETE FROM private.password_recovery_markers
  WHERE expires_at < now() - interval '1 day'
     OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '1 day');
$$;

REVOKE ALL ON FUNCTION private.cleanup_password_recovery_markers() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.issue_password_recovery_marker(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
SET row_security = off
AS $$
BEGIN
  IF p_user_id IS NULL OR p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_recovery_marker'
      USING ERRCODE = '22023';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_recovery_marker_expiry'
      USING ERRCODE = '22023';
  END IF;

  UPDATE private.password_recovery_markers
  SET consumed_at = now()
  WHERE user_id = p_user_id
    AND consumed_at IS NULL;

  INSERT INTO private.password_recovery_markers (
    token_hash,
    user_id,
    expires_at
  ) VALUES (
    p_token_hash,
    p_user_id,
    p_expires_at
  );

  PERFORM private.cleanup_password_recovery_markers();
END;
$$;

CREATE OR REPLACE FUNCTION public.peek_password_recovery_marker(
  p_user_id uuid,
  p_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private
SET row_security = off
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM private.password_recovery_markers
    WHERE token_hash = p_token_hash
      AND user_id = p_user_id
      AND consumed_at IS NULL
      AND expires_at > now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_password_recovery_marker(
  p_user_id uuid,
  p_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private
SET row_security = off
AS $$
DECLARE
  v_id text;
BEGIN
  UPDATE private.password_recovery_markers
  SET consumed_at = now()
  WHERE token_hash = p_token_hash
    AND user_id = p_user_id
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING token_hash INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_password_recovery_marker(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_password_recovery_marker(uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_password_recovery_marker(uuid, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.peek_password_recovery_marker(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.peek_password_recovery_marker(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peek_password_recovery_marker(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.consume_password_recovery_marker(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_password_recovery_marker(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_password_recovery_marker(uuid, text) TO service_role;
