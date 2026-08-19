-- PetGestor — aceitar convite de funcionário pendente

-- ---------------------------------------------------------------------------
-- RPC: accept_pending_invite
-- Chamada após login/cadastro para detectar e aceitar convite automaticamente.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_pending_invite()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_invite record;
  v_company_name text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'not_authenticated');
  END IF;

  SELECT lower(u.email)
  INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'no_email');
  END IF;

  SELECT cmi.*
  INTO v_invite
  FROM public.company_member_invites cmi
  WHERE lower(cmi.email) = v_user_email
    AND cmi.status = 'pending'
    AND cmi.expires_at > now()
  ORDER BY cmi.created_at DESC
  LIMIT 1;

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'no_pending_invite');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = v_invite.employee_id
      AND e.company_id = v_invite.company_id
      AND e.deleted_at IS NULL
      AND e.active = true
  ) THEN
    UPDATE public.company_member_invites
    SET status = 'revoked', revoked_at = now()
    WHERE id = v_invite.id;

    RETURN jsonb_build_object('accepted', false, 'reason', 'employee_archived');
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_user_id, split_part(v_user_email, '@', 1))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.company_members (
    company_id,
    user_id,
    role,
    access_profile,
    permissions,
    employee_id,
    own_schedule_only
  ) VALUES (
    v_invite.company_id,
    v_user_id,
    'staff',
    v_invite.access_profile,
    v_invite.permissions,
    v_invite.employee_id,
    coalesce(v_invite.own_schedule_only, false)
  )
  ON CONFLICT (company_id, user_id) DO UPDATE
  SET
    access_profile = EXCLUDED.access_profile,
    permissions = EXCLUDED.permissions,
    employee_id = EXCLUDED.employee_id,
    own_schedule_only = EXCLUDED.own_schedule_only,
    access_revoked_at = NULL,
    updated_at = now()
  WHERE public.company_members.role <> 'owner';

  UPDATE public.employees
  SET
    user_id = v_user_id,
    email = coalesce(email, v_user_email)
  WHERE id = v_invite.employee_id
    AND company_id = v_invite.company_id;

  UPDATE public.company_member_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invite.id;

  SELECT c.name
  INTO v_company_name
  FROM public.companies c
  WHERE c.id = v_invite.company_id;

  RETURN jsonb_build_object(
    'accepted', true,
    'company_id', v_invite.company_id,
    'company_name', coalesce(v_company_name, ''),
    'employee_id', v_invite.employee_id,
    'access_profile', v_invite.access_profile
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_pending_invite() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pending_invite() TO authenticated;
