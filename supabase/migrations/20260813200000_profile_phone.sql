-- PetGestor — telefone do responsável em profiles
-- phone NULL permitido para contas antigas; novos cadastros exigem no app.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_e164_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_e164_check
  CHECK (
    phone IS NULL
    OR phone ~ '^\+55[1-9][0-9]{9,10}$'
  );

COMMENT ON COLUMN public.profiles.phone IS
  'Telefone/WhatsApp do usuário em E.164 (+55…). Obrigatório apenas em novos cadastros via app.';

-- Extende complete_onboarding com telefone opcional (DEFAULT NULL para compatibilidade).
DROP FUNCTION IF EXISTS public.complete_onboarding(text, text);

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
  v_existing_company_id uuid;
  v_full_name text;
  v_company_name text;
  v_phone text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

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
  INTO v_existing_company_id
  FROM public.company_members cm
  WHERE cm.user_id = v_user_id
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_existing_company_id IS NOT NULL THEN
    RETURN v_existing_company_id;
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
