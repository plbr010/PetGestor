-- BLOCO 8 — Auth, onboarding, convites e rate limit persistente.
-- Incremental. Não edita migrations anteriores. Não desabilita RLS.

-- ---------------------------------------------------------------------------
-- 1. complete_onboarding: lock por usuário + membership ativa vs revogada
-- ---------------------------------------------------------------------------
-- Regras:
--   * pg_advisory_xact_lock(auth.uid()) serializa duplo clique / retry / paralelo
--   * membership ATIVA  → retorna a mesma company_id (idempotente)
--   * só membership REVOGADA → NÃO cria empresa nova e NÃO ressuscita acesso
--   * sem membership → cria empresa + owner (trial via trigger existente)
--   * várias ativas → escolhe a mais recentemente atualizada (não a mais antiga)

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

  PERFORM pg_advisory_xact_lock(hashtextextended('complete_onboarding:' || v_user_id::text, 0));

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
  ORDER BY cm.updated_at DESC NULLS LAST
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
    RAISE EXCEPTION 'onboarding_access_revoked'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.companies (name, created_by)
  VALUES (v_company_name, v_user_id)
  RETURNING id INTO v_company_id;

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (v_company_id, v_user_id, 'owner');

  RETURN v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Convite pendente: no máximo um por empresa + e-mail (se não houver duplicata legada)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.company_member_invites
    WHERE status = 'pending'
    GROUP BY company_id, lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'BLOCO 8: convites pendentes duplicados por e-mail — índice único não criado. Rode docs/sql/diagnose-bloco-8-auth-onboarding.sql';
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS company_member_invites_pending_email_uidx
    ON public.company_member_invites (company_id, lower(email))
    WHERE status = 'pending';
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Rate limit persistente / atômico (private + RPC SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.sensitive_action_rate_limits (
  bucket_hash text PRIMARY KEY,
  action text NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  hit_count integer NOT NULL CHECK (hit_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.sensitive_action_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.rate_limit_policy(p_action text)
RETURNS TABLE (max_hits integer, window_seconds integer)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = private
AS $$
BEGIN
  CASE p_action
    WHEN 'login_email' THEN
      max_hits := 10; window_seconds := 900; RETURN NEXT;
    WHEN 'login_ip' THEN
      max_hits := 20; window_seconds := 900; RETURN NEXT;
    WHEN 'signup_email' THEN
      max_hits := 5; window_seconds := 900; RETURN NEXT;
    WHEN 'signup_ip' THEN
      max_hits := 10; window_seconds := 900; RETURN NEXT;
    WHEN 'recovery_email' THEN
      max_hits := 5; window_seconds := 900; RETURN NEXT;
    WHEN 'recovery_ip' THEN
      max_hits := 10; window_seconds := 900; RETURN NEXT;
    WHEN 'resend_email' THEN
      max_hits := 5; window_seconds := 900; RETURN NEXT;
    WHEN 'resend_ip' THEN
      max_hits := 10; window_seconds := 900; RETURN NEXT;
    WHEN 'invite_actor' THEN
      max_hits := 20; window_seconds := 900; RETURN NEXT;
    WHEN 'invite_email' THEN
      max_hits := 10; window_seconds := 900; RETURN NEXT;
    ELSE
      RAISE EXCEPTION 'invalid_rate_limit_action'
        USING ERRCODE = '22023';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_sensitive_action_rate_limit(
  p_action text,
  p_subject_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
SET row_security = off
AS $$
DECLARE
  v_max integer;
  v_window integer;
  v_now timestamptz := clock_timestamp();
  v_hit integer;
  v_window_start timestamptz;
  v_allowed boolean;
  v_retry integer;
BEGIN
  IF p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_rate_limit_subject'
      USING ERRCODE = '22023';
  END IF;

  SELECT pol.max_hits, pol.window_seconds
  INTO v_max, v_window
  FROM private.rate_limit_policy(p_action) AS pol;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_action || ':' || p_subject_hash, 0));

  INSERT INTO private.sensitive_action_rate_limits AS rl (
    bucket_hash,
    action,
    window_started_at,
    window_seconds,
    hit_count,
    updated_at
  )
  VALUES (
    p_subject_hash,
    p_action,
    v_now,
    v_window,
    1,
    v_now
  )
  ON CONFLICT (bucket_hash) DO UPDATE
  SET
    action = EXCLUDED.action,
    window_seconds = EXCLUDED.window_seconds,
    window_started_at = CASE
      WHEN rl.window_started_at + make_interval(secs => rl.window_seconds) <= EXCLUDED.updated_at
      THEN EXCLUDED.window_started_at
      ELSE rl.window_started_at
    END,
    hit_count = CASE
      WHEN rl.window_started_at + make_interval(secs => rl.window_seconds) <= EXCLUDED.updated_at
      THEN 1
      ELSE rl.hit_count + 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING rl.hit_count, rl.window_started_at
  INTO v_hit, v_window_start;

  v_allowed := v_hit <= v_max;
  v_retry := GREATEST(
    0,
    CEIL(EXTRACT(EPOCH FROM (v_window_start + make_interval(secs => v_window) - v_now)))::integer
  );

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'retry_after_seconds', CASE WHEN v_allowed THEN 0 ELSE v_retry END,
    'hit_count', v_hit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_sensitive_action_rate_limit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_sensitive_action_rate_limit(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION private.rate_limit_policy(text) FROM PUBLIC, anon, authenticated;
