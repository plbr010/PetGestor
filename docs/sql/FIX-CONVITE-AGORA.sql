-- =============================================================================
-- PetGestor — APLICAR TUDO: funções de convite + reparo do e-mail do funcionário
-- Cole este arquivo INTEIRO no Supabase → SQL Editor → Run
-- Depois: no app, abra o funcionário → Dar acesso / reenviar (para gerar o link)
-- =============================================================================

-- PetGestor — hardening do fluxo de convite de funcionários
-- Não altera migrations anteriores; reforça accept/grant/peek e índices.

-- ---------------------------------------------------------------------------
-- Índice para lookup por e-mail normalizado
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_company_member_invites_email_lower
  ON public.company_member_invites (lower(email), status);

-- ---------------------------------------------------------------------------
-- Marca convites vencidos (status expired)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.expire_stale_member_invites()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  UPDATE public.company_member_invites
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at <= now();
END;
$$;

-- ---------------------------------------------------------------------------
-- peek_pending_invite — lê convite sem aceitar (para UI "Você foi convidado")
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.peek_pending_invite()
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
  PERFORM private.expire_stale_member_invites();

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'reason', 'not_authenticated');
  END IF;

  SELECT lower(u.email)
  INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_user_email IS NULL OR v_user_email = '' THEN
    RETURN jsonb_build_object('found', false, 'reason', 'no_email');
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
    RETURN jsonb_build_object('found', false, 'reason', 'no_pending_invite');
  END IF;

  SELECT c.name
  INTO v_company_name
  FROM public.companies c
  WHERE c.id = v_invite.company_id;

  RETURN jsonb_build_object(
    'found', true,
    'invite_id', v_invite.id,
    'company_id', v_invite.company_id,
    'company_name', coalesce(v_company_name, ''),
    'employee_id', v_invite.employee_id,
    'access_profile', v_invite.access_profile,
    'expires_at', v_invite.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.peek_pending_invite() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_pending_invite() TO authenticated;

-- ---------------------------------------------------------------------------
-- accept_pending_invite — hardened
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
  v_existing_user_id uuid;
BEGIN
  PERFORM private.expire_stale_member_invites();

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'not_authenticated');
  END IF;

  SELECT lower(u.email)
  INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_user_email IS NULL OR v_user_email = '' THEN
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
    IF EXISTS (
      SELECT 1
      FROM public.company_member_invites cmi
      WHERE lower(cmi.email) = v_user_email
        AND (
          cmi.status = 'expired'
          OR (cmi.status = 'pending' AND cmi.expires_at <= now())
        )
    ) THEN
      RETURN jsonb_build_object('accepted', false, 'reason', 'invite_expired');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.company_member_invites cmi
      WHERE lower(cmi.email) = v_user_email
        AND cmi.status = 'revoked'
    ) THEN
      RETURN jsonb_build_object('accepted', false, 'reason', 'invite_revoked');
    END IF;

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

  SELECT e.user_id
  INTO v_existing_user_id
  FROM public.employees e
  WHERE e.id = v_invite.employee_id
    AND e.company_id = v_invite.company_id;

  IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> v_user_id THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'employee_already_linked');
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
    AND company_id = v_invite.company_id
    AND (user_id IS NULL OR user_id = v_user_id);

  UPDATE public.company_member_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invite.id;

  -- Aceita outros pendentes do mesmo e-mail/empresa (evita duplicidade)
  UPDATE public.company_member_invites
  SET status = 'accepted', accepted_at = now()
  WHERE company_id = v_invite.company_id
    AND lower(email) = v_user_email
    AND status = 'pending'
    AND id <> v_invite.id;

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

-- ---------------------------------------------------------------------------
-- grant_employee_access — não sobrescreve vínculo de outro usuário
-- ---------------------------------------------------------------------------

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

  SELECT u.id
  INTO v_target_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_email
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

    RETURN jsonb_build_object(
      'status', 'invite_pending',
      'email', v_email,
      'email_delivery', 'not_configured'
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
    'email_delivery', 'not_configured'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_employee_access(uuid, text, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_employee_access(uuid, text, text, jsonb, boolean) TO authenticated;
-- PetGestor — lookup público limitado de convite por e-mail (pré-cadastro)
-- Não permite aceitar convite nem informar company_id; só UX de descoberta.

CREATE OR REPLACE FUNCTION public.lookup_pending_invite_by_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
SET row_security = off
AS $$
DECLARE
  v_email text;
  v_invite record;
  v_company_name text;
BEGIN
  PERFORM private.expire_stale_member_invites();

  v_email := lower(trim(coalesce(p_email, '')));

  IF char_length(v_email) < 3 OR char_length(v_email) > 254 OR position('@' in v_email) = 0 THEN
    RETURN jsonb_build_object('found', false, 'reason', 'invalid_email');
  END IF;

  SELECT cmi.id, cmi.company_id, cmi.access_profile, cmi.expires_at
  INTO v_invite
  FROM public.company_member_invites cmi
  WHERE lower(cmi.email) = v_email
    AND cmi.status = 'pending'
    AND cmi.expires_at > now()
  ORDER BY cmi.created_at DESC
  LIMIT 1;

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('found', false, 'reason', 'no_pending_invite');
  END IF;

  SELECT c.name
  INTO v_company_name
  FROM public.companies c
  WHERE c.id = v_invite.company_id;

  -- Dados mínimos para UX — sem company_id / invite_id / permissions
  RETURN jsonb_build_object(
    'found', true,
    'company_name', coalesce(v_company_name, ''),
    'access_profile', v_invite.access_profile,
    'expires_at', v_invite.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_pending_invite_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_pending_invite_by_email(text) TO anon, authenticated;
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

-- =============================================================================
-- REPARO: cria/reabre convite pendente para o Gmail abaixo
-- =============================================================================

DO $$
DECLARE
  v_email text := lower(trim('genyvitalflexpddro@gmail.com'));
  v_employee_id uuid;
  v_company_id uuid;
  v_owner_id uuid;
  v_profile text := 'reception';
  v_permissions jsonb := '[]'::jsonb;
BEGIN
  -- 1) Funcionário pelo e-mail cadastrado
  SELECT e.id, e.company_id
  INTO v_employee_id, v_company_id
  FROM public.employees e
  WHERE lower(trim(coalesce(e.email, ''))) = v_email
    AND e.deleted_at IS NULL
  ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC
  LIMIT 1;

  -- 2) Fallback: último convite (qualquer status) desse e-mail
  IF v_employee_id IS NULL THEN
    SELECT cmi.employee_id, cmi.company_id, cmi.access_profile, cmi.permissions
    INTO v_employee_id, v_company_id, v_profile, v_permissions
    FROM public.company_member_invites cmi
    WHERE lower(cmi.email) = v_email
    ORDER BY cmi.created_at DESC
    LIMIT 1;
  END IF;

  -- 3) Fallback: funcionário chamado Kleber na empresa Aupet (ajuste se precisar)
  IF v_employee_id IS NULL THEN
    SELECT e.id, e.company_id
    INTO v_employee_id, v_company_id
    FROM public.employees e
    JOIN public.companies c ON c.id = e.company_id
    WHERE e.deleted_at IS NULL
      AND (
        lower(e.name) LIKE '%kleber%'
        OR lower(c.name) LIKE '%aupet%'
      )
    ORDER BY
      CASE WHEN lower(e.name) LIKE '%kleber%' THEN 0 ELSE 1 END,
      e.created_at DESC
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'employee_not_found_for_repair: não achei funcionário para %. Cadastre o e-mail na ficha e rode de novo.', v_email;
  END IF;

  SELECT cm.user_id
  INTO v_owner_id
  FROM public.company_members cm
  WHERE cm.company_id = v_company_id
    AND cm.role = 'owner'
    AND cm.access_revoked_at IS NULL
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'owner_not_found_for_company: %', v_company_id;
  END IF;

  -- Garante e-mail na ficha do funcionário
  UPDATE public.employees e
  SET email = v_email
  WHERE e.id = v_employee_id
    AND e.company_id = v_company_id;

  -- Remove vínculo prematuro (Auth sem confirmação)
  DELETE FROM public.company_members cm
  WHERE cm.company_id = v_company_id
    AND cm.employee_id = v_employee_id
    AND cm.role = 'staff'
    AND NOT EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = cm.user_id AND u.email_confirmed_at IS NOT NULL
    );

  UPDATE public.employees e
  SET user_id = NULL
  WHERE e.id = v_employee_id
    AND e.company_id = v_company_id
    AND e.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = e.user_id AND u.email_confirmed_at IS NOT NULL
    );

  -- Reabre ou cria convite pendente
  UPDATE public.company_member_invites cmi
  SET
    email = v_email,
    access_profile = coalesce(nullif(v_profile, ''), 'reception'),
    permissions = coalesce(v_permissions, '[]'::jsonb),
    invited_by = v_owner_id,
    status = 'pending',
    accepted_at = NULL,
    revoked_at = NULL,
    expires_at = now() + interval '14 days',
    created_at = now()
  WHERE cmi.id = (
    SELECT cmi2.id
    FROM public.company_member_invites cmi2
    WHERE cmi2.company_id = v_company_id
      AND cmi2.employee_id = v_employee_id
    ORDER BY cmi2.created_at DESC
    LIMIT 1
  );

  IF NOT FOUND THEN
    INSERT INTO public.company_member_invites (
      company_id, employee_id, email, access_profile, permissions,
      own_schedule_only, invited_by, status, expires_at
    ) VALUES (
      v_company_id, v_employee_id, v_email,
      coalesce(nullif(v_profile, ''), 'reception'),
      coalesce(v_permissions, '[]'::jsonb),
      false, v_owner_id, 'pending', now() + interval '14 days'
    );
  END IF;

  -- Se ainda não há pending (UPDATE não achou linha), insere
  IF NOT EXISTS (
    SELECT 1 FROM public.company_member_invites cmi
    WHERE cmi.company_id = v_company_id
      AND cmi.employee_id = v_employee_id
      AND cmi.status = 'pending'
  ) THEN
    INSERT INTO public.company_member_invites (
      company_id, employee_id, email, access_profile, permissions,
      own_schedule_only, invited_by, status, expires_at
    ) VALUES (
      v_company_id, v_employee_id, v_email,
      coalesce(nullif(v_profile, ''), 'reception'),
      coalesce(v_permissions, '[]'::jsonb),
      false, v_owner_id, 'pending', now() + interval '14 days'
    );
  END IF;

  RAISE NOTICE 'OK: convite pendente para % (employee=%, company=%)', v_email, v_employee_id, v_company_id;
END;
$$;

-- Verificação final (tem que retornar found=true)
SELECT public.lookup_pending_invite_by_email('genyvitalflexpddro@gmail.com') AS lookup_result;

SELECT id, email, status, expires_at, company_id, employee_id
FROM public.company_member_invites
WHERE lower(email) = 'genyvitalflexpddro@gmail.com'
ORDER BY created_at DESC;

SELECT id, email, email_confirmed_at, invited_at
FROM auth.users
WHERE lower(email) = 'genyvitalflexpddro@gmail.com';
