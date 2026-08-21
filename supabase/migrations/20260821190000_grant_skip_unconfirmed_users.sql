-- PetGestor — grant_employee_access: não vincular usuário Auth ainda não confirmado
--
-- Problema: inviteUserByEmail cria auth.users sem email_confirmed_at. Um segundo
-- "Dar acesso" encontrava esse usuário e auto-vinculava (status=linked), marcando
-- o convite como accepted. O funcionário via "Convite não encontrado" no cadastro
-- e nunca recebia um fluxo útil de e-mail/senha.
--
-- Correção: só auto-vincular contas com e-mail confirmado. Contas convidadas
-- (ainda sem confirmação) continuam no caminho invite_pending.

CREATE OR REPLACE FUNCTION public.grant_employee_access(
  p_employee_id uuid,
  p_email text,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_actor uuid;
  v_company_id uuid;
  v_email text;
  v_target_user_id uuid;
  v_permissions jsonb;
  v_existing_user_id uuid;
BEGIN
  PERFORM private.expire_stale_member_invites();

  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT cm.company_id
  INTO v_company_id
  FROM public.company_members cm
  WHERE cm.user_id = v_actor
    AND cm.access_revoked_at IS NULL
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL OR NOT private.is_company_owner_or_admin(v_company_id) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.company_id = v_company_id
      AND e.deleted_at IS NULL
      AND e.active = true
  ) THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT e.user_id
  INTO v_existing_user_id
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.company_id = v_company_id;

  v_email := lower(trim(p_email));

  IF char_length(v_email) < 3 OR char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  IF p_access_profile NOT IN (
    'manager', 'reception', 'operational', 'finance', 'inventory_cash'
  ) THEN
    RAISE EXCEPTION 'invalid_access_profile' USING ERRCODE = '22023';
  END IF;

  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_permissions' USING ERRCODE = '22023';
  END IF;

  v_permissions := p_permissions;

  -- Somente contas com e-mail confirmado podem ser vinculadas na hora.
  -- Usuários criados por invite (ainda sem confirmação) NÃO contam aqui.
  SELECT u.id
  INTO v_target_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_email
    AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;

  IF v_existing_user_id IS NOT NULL
     AND v_target_user_id IS NOT NULL
     AND v_existing_user_id <> v_target_user_id THEN
    RAISE EXCEPTION 'employee_already_linked' USING ERRCODE = '23505';
  END IF;

  IF v_target_user_id IS NULL THEN
    INSERT INTO public.company_member_invites (
      company_id,
      employee_id,
      email,
      access_profile,
      permissions,
      own_schedule_only,
      invited_by,
      status
    ) VALUES (
      v_company_id,
      p_employee_id,
      v_email,
      p_access_profile,
      v_permissions,
      coalesce(p_own_schedule_only, false),
      v_actor,
      'pending'
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.company_member_invites cmi
    SET
      email = v_email,
      access_profile = p_access_profile,
      permissions = v_permissions,
      own_schedule_only = coalesce(p_own_schedule_only, false),
      invited_by = v_actor,
      status = 'pending',
      revoked_at = NULL,
      expires_at = now() + interval '14 days',
      created_at = now()
    WHERE cmi.company_id = v_company_id
      AND cmi.employee_id = p_employee_id
      AND cmi.status = 'pending';

    -- Reabre convite se um grant anterior marcou accepted por engano (usuário Auth
    -- convidado mas ainda não confirmado / sem senha útil).
    IF NOT EXISTS (
      SELECT 1
      FROM public.company_member_invites cmi
      WHERE cmi.company_id = v_company_id
        AND cmi.employee_id = p_employee_id
        AND cmi.status = 'pending'
    ) THEN
      UPDATE public.company_member_invites cmi
      SET
        email = v_email,
        access_profile = p_access_profile,
        permissions = v_permissions,
        own_schedule_only = coalesce(p_own_schedule_only, false),
        invited_by = v_actor,
        status = 'pending',
        accepted_at = NULL,
        revoked_at = NULL,
        expires_at = now() + interval '14 days',
        created_at = now()
      WHERE cmi.id = (
        SELECT cmi2.id
        FROM public.company_member_invites cmi2
        WHERE cmi2.company_id = v_company_id
          AND cmi2.employee_id = p_employee_id
        ORDER BY cmi2.created_at DESC
        LIMIT 1
      );
    END IF;

    -- Se um grant anterior vinculou membership cedo demais (usuário sem confirmação),
    -- remove o vínculo prematuro para o funcionário poder aceitar de novo.
    DELETE FROM public.company_members cm
    WHERE cm.company_id = v_company_id
      AND cm.employee_id = p_employee_id
      AND cm.role = 'staff'
      AND NOT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = cm.user_id
          AND u.email_confirmed_at IS NOT NULL
      );

    UPDATE public.employees e
    SET user_id = NULL
    WHERE e.id = p_employee_id
      AND e.company_id = v_company_id
      AND e.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = e.user_id
          AND u.email_confirmed_at IS NOT NULL
      );

    RETURN jsonb_build_object(
      'status', 'invite_pending',
      'email', v_email,
      'email_delivery', 'pending_app_send'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = v_company_id
      AND cm.user_id = v_target_user_id
      AND cm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'cannot_modify_owner_access' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.company_members (
    company_id,
    user_id,
    role,
    access_profile,
    permissions,
    employee_id,
    own_schedule_only,
    access_revoked_at
  ) VALUES (
    v_company_id,
    v_target_user_id,
    'staff',
    p_access_profile,
    v_permissions,
    p_employee_id,
    coalesce(p_own_schedule_only, false),
    NULL
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

  UPDATE public.employees e
  SET
    user_id = v_target_user_id,
    email = coalesce(e.email, v_email)
  WHERE e.id = p_employee_id
    AND e.company_id = v_company_id
    AND (e.user_id IS NULL OR e.user_id = v_target_user_id);

  UPDATE public.company_member_invites cmi
  SET
    status = 'accepted',
    accepted_at = now()
  WHERE cmi.company_id = v_company_id
    AND cmi.employee_id = p_employee_id
    AND cmi.status = 'pending';

  RETURN jsonb_build_object(
    'status', 'linked',
    'user_id', v_target_user_id,
    'email', v_email,
    'email_delivery', 'not_needed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_employee_access(uuid, text, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_employee_access(uuid, text, text, jsonb, boolean) TO authenticated;
