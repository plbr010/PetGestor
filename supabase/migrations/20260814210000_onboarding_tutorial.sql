-- PetGestor — estado do tutorial inicial guiado (por usuário)
-- Contas existentes: marcadas como concluídas para não interromper quem já usa o sistema.
-- Novos cadastros: onboarding_tutorial_completed_at NULL → tutorial aparece no dashboard.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_tutorial_completed_at timestamptz;

COMMENT ON COLUMN public.profiles.onboarding_tutorial_completed_at IS
  'Quando o usuário concluiu ou pulou o tutorial inicial. NULL = ainda não visto.';

UPDATE public.profiles
SET onboarding_tutorial_completed_at = coalesce(onboarding_tutorial_completed_at, now())
WHERE onboarding_tutorial_completed_at IS NULL;

-- RPC segura: marca tutorial como concluído apenas para auth.uid()
CREATE OR REPLACE FUNCTION public.complete_onboarding_tutorial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid;
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
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding_tutorial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_tutorial() TO authenticated;
