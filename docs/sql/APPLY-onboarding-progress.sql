
-- Atalho para SQL Editor (idempotente).
-- PetGestor — progresso granular do onboarding de ativação (por usuário + empresa)
-- Não destrutivo: mantém profiles.onboarding_tutorial_completed_at e sincroniza ao concluir.

CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  onboarding_started_at timestamptz,
  welcome_seen_at timestamptz,
  guided_started_at timestamptz,
  guided_skipped_at timestamptz,
  guided_active boolean NOT NULL DEFAULT false,
  last_guided_step text,
  workflow_step_viewed_at timestamptz,
  finance_step_viewed_at timestamptz,
  onboarding_completed_at timestamptz,
  checklist_dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_progress_company_user_uidx UNIQUE (company_id, user_id),
  CONSTRAINT onboarding_progress_last_step_length CHECK (
    last_guided_step IS NULL
    OR (char_length(last_guided_step) >= 2 AND char_length(last_guided_step) <= 64)
  )
);

COMMENT ON TABLE public.onboarding_progress IS
  'Progresso do onboarding de ativação por membro (user_id) dentro da empresa.';

CREATE INDEX IF NOT EXISTS onboarding_progress_company_idx
  ON public.onboarding_progress (company_id);

CREATE INDEX IF NOT EXISTS onboarding_progress_user_idx
  ON public.onboarding_progress (user_id);

DROP TRIGGER IF EXISTS onboarding_progress_set_updated_at ON public.onboarding_progress;
CREATE TRIGGER onboarding_progress_set_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS onboarding_progress_prevent_company_change
  ON public.onboarding_progress;
CREATE TRIGGER onboarding_progress_prevent_company_change
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_progress_select_own ON public.onboarding_progress;
CREATE POLICY onboarding_progress_select_own
  ON public.onboarding_progress
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND private.is_company_member(company_id)
  );

DROP POLICY IF EXISTS onboarding_progress_insert_own ON public.onboarding_progress;
CREATE POLICY onboarding_progress_insert_own
  ON public.onboarding_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND private.is_company_member(company_id)
  );

DROP POLICY IF EXISTS onboarding_progress_update_own ON public.onboarding_progress;
CREATE POLICY onboarding_progress_update_own
  ON public.onboarding_progress
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND private.is_company_member(company_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND private.is_company_member(company_id)
  );

GRANT SELECT, INSERT, UPDATE ON public.onboarding_progress TO authenticated;

-- Contas que já concluíram/pularam o tour antigo: não reabrir onboarding.
INSERT INTO public.onboarding_progress (
  company_id,
  user_id,
  welcome_seen_at,
  guided_skipped_at,
  onboarding_completed_at,
  checklist_dismissed_at,
  onboarding_started_at
)
SELECT
  cm.company_id,
  cm.user_id,
  coalesce(p.onboarding_tutorial_completed_at, now()),
  p.onboarding_tutorial_completed_at,
  p.onboarding_tutorial_completed_at,
  p.onboarding_tutorial_completed_at,
  p.onboarding_tutorial_completed_at
FROM public.company_members cm
JOIN public.profiles p ON p.id = cm.user_id
WHERE p.onboarding_tutorial_completed_at IS NOT NULL
ON CONFLICT (company_id, user_id) DO NOTHING;

-- Garante linha de progresso (e opcionalmente sincroniza profiles) para o usuário autenticado.
CREATE OR REPLACE FUNCTION public.upsert_onboarding_progress(
  p_company_id uuid,
  p_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS public.onboarding_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid;
  v_row public.onboarding_progress;
  v_now timestamptz := now();
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT private.is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'not_a_member'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.onboarding_progress (company_id, user_id, onboarding_started_at)
  VALUES (p_company_id, v_user_id, v_now)
  ON CONFLICT (company_id, user_id) DO NOTHING;

  UPDATE public.onboarding_progress op
  SET
    onboarding_started_at = coalesce(
      op.onboarding_started_at,
      CASE
        WHEN coalesce((p_patch->>'mark_started')::boolean, false) THEN v_now
        ELSE NULL
      END,
      op.onboarding_started_at
    ),
    welcome_seen_at = CASE
      WHEN coalesce((p_patch->>'welcome_seen')::boolean, false)
        THEN coalesce(op.welcome_seen_at, v_now)
      ELSE op.welcome_seen_at
    END,
    guided_started_at = CASE
      WHEN coalesce((p_patch->>'guided_started')::boolean, false)
        THEN coalesce(op.guided_started_at, v_now)
      ELSE op.guided_started_at
    END,
    guided_skipped_at = CASE
      WHEN coalesce((p_patch->>'guided_skipped')::boolean, false)
        THEN coalesce(op.guided_skipped_at, v_now)
      WHEN coalesce((p_patch->>'restart_guided')::boolean, false)
        THEN NULL
      ELSE op.guided_skipped_at
    END,
    guided_active = CASE
      WHEN coalesce((p_patch->>'guided_active')::boolean, false) THEN true
      WHEN p_patch ? 'guided_active' AND (p_patch->>'guided_active') = 'false' THEN false
      WHEN coalesce((p_patch->>'guided_skipped')::boolean, false) THEN false
      WHEN coalesce((p_patch->>'restart_guided')::boolean, false) THEN true
      ELSE op.guided_active
    END,
    last_guided_step = CASE
      WHEN p_patch ? 'last_guided_step' THEN nullif(p_patch->>'last_guided_step', '')
      WHEN coalesce((p_patch->>'restart_guided')::boolean, false) THEN 'welcome'
      ELSE op.last_guided_step
    END,
    workflow_step_viewed_at = CASE
      WHEN coalesce((p_patch->>'workflow_viewed')::boolean, false)
        THEN coalesce(op.workflow_step_viewed_at, v_now)
      ELSE op.workflow_step_viewed_at
    END,
    finance_step_viewed_at = CASE
      WHEN coalesce((p_patch->>'finance_viewed')::boolean, false)
        THEN coalesce(op.finance_step_viewed_at, v_now)
      ELSE op.finance_step_viewed_at
    END,
    onboarding_completed_at = CASE
      WHEN coalesce((p_patch->>'completed')::boolean, false)
        THEN coalesce(op.onboarding_completed_at, v_now)
      ELSE op.onboarding_completed_at
    END,
    checklist_dismissed_at = CASE
      WHEN coalesce((p_patch->>'checklist_dismissed')::boolean, false)
        THEN coalesce(op.checklist_dismissed_at, v_now)
      WHEN coalesce((p_patch->>'restart_guided')::boolean, false)
        THEN NULL
      ELSE op.checklist_dismissed_at
    END,
    updated_at = v_now
  WHERE op.company_id = p_company_id
    AND op.user_id = v_user_id
  RETURNING * INTO v_row;

  IF coalesce((p_patch->>'completed')::boolean, false) THEN
    UPDATE public.profiles
    SET
      onboarding_tutorial_completed_at = coalesce(onboarding_tutorial_completed_at, v_now),
      updated_at = v_now
    WHERE id = v_user_id;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_onboarding_progress(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_onboarding_progress(uuid, jsonb) TO authenticated;

-- Compat: complete_onboarding_tutorial também marca progresso novo, se existir linha/empresa.
CREATE OR REPLACE FUNCTION public.complete_onboarding_tutorial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET
    onboarding_tutorial_completed_at = coalesce(onboarding_tutorial_completed_at, now()),
    updated_at = now()
  WHERE id = v_user_id;

  SELECT company_id
  INTO v_company_id
  FROM public.company_members
  WHERE user_id = v_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    PERFORM public.upsert_onboarding_progress(
      v_company_id,
      jsonb_build_object(
        'welcome_seen', true,
        'guided_active', false,
        'completed', true,
        'checklist_dismissed', true
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding_tutorial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_tutorial() TO authenticated;
