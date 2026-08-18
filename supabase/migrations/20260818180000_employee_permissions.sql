-- PetGestor — permissões por funcionário (RBAC por empresa)

-- ---------------------------------------------------------------------------
-- company_members: perfil, permissões granulares e vínculo operacional
-- ---------------------------------------------------------------------------

ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS access_profile text,
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS employee_id uuid,
  ADD COLUMN IF NOT EXISTS access_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS own_schedule_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.company_members
  DROP CONSTRAINT IF EXISTS company_members_access_profile_check;

ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_access_profile_check CHECK (
    access_profile IS NULL
    OR access_profile IN (
      'owner_admin',
      'manager',
      'reception',
      'operational',
      'finance',
      'inventory_cash'
    )
  );

ALTER TABLE public.company_members
  DROP CONSTRAINT IF EXISTS company_members_permissions_array_check;

ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_permissions_array_check CHECK (
    jsonb_typeof(permissions) = 'array'
  );

-- ---------------------------------------------------------------------------
-- employees: vínculo com usuário autenticado
-- ---------------------------------------------------------------------------

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_company_user_uidx
  ON public.employees (company_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.company_members
  DROP CONSTRAINT IF EXISTS company_members_employee_company_fkey;

ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_employee_company_fkey
  FOREIGN KEY (employee_id, company_id)
  REFERENCES public.employees (id, company_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_members_employee_id
  ON public.company_members (employee_id)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_members_active_access
  ON public.company_members (company_id, user_id)
  WHERE access_revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Convites (base — e-mail transacional pode ser ligado depois)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_member_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  email text NOT NULL,
  access_profile text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  own_schedule_only boolean NOT NULL DEFAULT false,
  invited_by uuid NOT NULL REFERENCES auth.users (id),
  status text NOT NULL DEFAULT 'pending',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  CONSTRAINT company_member_invites_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees (id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT company_member_invites_access_profile_check CHECK (
    access_profile IN (
      'manager',
      'reception',
      'operational',
      'finance',
      'inventory_cash'
    )
  ),
  CONSTRAINT company_member_invites_status_check CHECK (
    status IN ('pending', 'accepted', 'revoked', 'expired')
  ),
  CONSTRAINT company_member_invites_email_length CHECK (
    char_length(trim(email)) >= 3
    AND char_length(email) <= 254
  )
);

CREATE INDEX IF NOT EXISTS idx_company_member_invites_company_status
  ON public.company_member_invites (company_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS company_member_invites_pending_employee_uidx
  ON public.company_member_invites (company_id, employee_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Migração: owners/admins mantêm acesso total
-- ---------------------------------------------------------------------------

UPDATE public.company_members
SET
  access_profile = 'owner_admin',
  permissions = '[]'::jsonb
WHERE role IN ('owner', 'admin')
  AND (access_profile IS NULL OR access_profile <> 'owner_admin');

UPDATE public.company_members
SET access_profile = 'reception'
WHERE role = 'staff'
  AND access_profile IS NULL;

-- ---------------------------------------------------------------------------
-- Helpers de permissão (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.member_has_active_access(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.access_revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.is_company_owner_or_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.access_revoked_at IS NULL
      AND cm.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION private.has_app_permission(p_company_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN NOT private.member_has_active_access(p_company_id) THEN false
    WHEN private.is_company_owner_or_admin(p_company_id) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = p_company_id
        AND cm.user_id = auth.uid()
        AND cm.access_revoked_at IS NULL
        AND cm.permissions @> to_jsonb(ARRAY[p_permission]::text[])
    )
  END;
$$;

REVOKE ALL ON FUNCTION private.member_has_active_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_company_owner_or_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_app_permission(uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Proteção: owner não pode se bloquear
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.prevent_owner_self_lockout()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, auth
AS $$
BEGIN
  IF OLD.role = 'owner' AND NEW.user_id = auth.uid() THEN
    IF NEW.access_revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'owner_cannot_revoke_self'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.role <> 'owner' THEN
      RAISE EXCEPTION 'owner_cannot_demote_self'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_members_prevent_owner_lockout ON public.company_members;
CREATE TRIGGER company_members_prevent_owner_lockout
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_owner_self_lockout();

-- ---------------------------------------------------------------------------
-- Revogar acesso quando funcionário é arquivado ou desativado
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.revoke_employee_system_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
BEGIN
  IF (
    (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    OR (NEW.active = false AND OLD.active = true)
  ) THEN
    UPDATE public.company_members cm
    SET
      access_revoked_at = now(),
      updated_at = now()
    WHERE cm.company_id = NEW.company_id
      AND cm.employee_id = NEW.id
      AND cm.access_revoked_at IS NULL
      AND cm.role <> 'owner';

    UPDATE public.company_member_invites cmi
    SET
      status = 'revoked',
      revoked_at = now()
    WHERE cmi.company_id = NEW.company_id
      AND cmi.employee_id = NEW.id
      AND cmi.status = 'pending';

    NEW.user_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_revoke_access_on_archive ON public.employees;
CREATE TRIGGER employees_revoke_access_on_archive
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION private.revoke_employee_system_access();

DROP TRIGGER IF EXISTS company_members_set_updated_at ON public.company_members;
CREATE TRIGGER company_members_set_updated_at
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: conceder / atualizar acesso de funcionário
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
BEGIN
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

    RETURN jsonb_build_object('status', 'invite_pending', 'email', v_email);
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
    AND e.company_id = v_company_id;

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
    'email', v_email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_employee_access(
  p_employee_id uuid,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_actor uuid;
  v_company_id uuid;
BEGIN
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

  IF p_access_profile NOT IN (
    'manager', 'reception', 'operational', 'finance', 'inventory_cash'
  ) THEN
    RAISE EXCEPTION 'invalid_access_profile' USING ERRCODE = '22023';
  END IF;

  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_permissions' USING ERRCODE = '22023';
  END IF;

  UPDATE public.company_members cm
  SET
    access_profile = p_access_profile,
    permissions = p_permissions,
    own_schedule_only = coalesce(p_own_schedule_only, false),
    updated_at = now()
  WHERE cm.company_id = v_company_id
    AND cm.employee_id = p_employee_id
    AND cm.access_revoked_at IS NULL
    AND cm.role <> 'owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_access_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_employee_access(p_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_actor uuid;
  v_company_id uuid;
BEGIN
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

  UPDATE public.company_members cm
  SET
    access_revoked_at = now(),
    updated_at = now()
  WHERE cm.company_id = v_company_id
    AND cm.employee_id = p_employee_id
    AND cm.access_revoked_at IS NULL
    AND cm.role <> 'owner';

  UPDATE public.company_member_invites cmi
  SET
    status = 'revoked',
    revoked_at = now()
  WHERE cmi.company_id = v_company_id
    AND cmi.employee_id = p_employee_id
    AND cmi.status = 'pending';

  UPDATE public.employees e
  SET user_id = NULL
  WHERE e.id = p_employee_id
    AND e.company_id = v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_employee_access(uuid, text, text, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_employee_access(uuid, text, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_employee_access(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.grant_employee_access(uuid, text, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_employee_access(uuid, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_employee_access(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS — company_members update (somente owner/admin) + convites
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS company_members_update_owner_admin ON public.company_members;
CREATE POLICY company_members_update_owner_admin
  ON public.company_members
  FOR UPDATE
  TO authenticated
  USING (private.is_company_owner_or_admin(company_id))
  WITH CHECK (private.is_company_owner_or_admin(company_id));

GRANT UPDATE ON public.company_members TO authenticated;

ALTER TABLE public.company_member_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_member_invites_select_admin ON public.company_member_invites;
CREATE POLICY company_member_invites_select_admin
  ON public.company_member_invites
  FOR SELECT
  TO authenticated
  USING (private.is_company_owner_or_admin(company_id));

DROP POLICY IF EXISTS company_member_invites_insert_admin ON public.company_member_invites;
CREATE POLICY company_member_invites_insert_admin
  ON public.company_member_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_company_owner_or_admin(company_id));

DROP POLICY IF EXISTS company_member_invites_update_admin ON public.company_member_invites;
CREATE POLICY company_member_invites_update_admin
  ON public.company_member_invites
  FOR UPDATE
  TO authenticated
  USING (private.is_company_owner_or_admin(company_id))
  WITH CHECK (private.is_company_owner_or_admin(company_id));

GRANT SELECT, INSERT, UPDATE ON public.company_member_invites TO authenticated;

-- Reforço RLS em financial_entries
DROP POLICY IF EXISTS financial_entries_select ON public.financial_entries;
CREATE POLICY financial_entries_select ON public.financial_entries
  FOR SELECT
  TO authenticated
  USING (
    private.is_company_member(company_id)
    AND (
      private.is_company_owner_or_admin(company_id)
      OR private.has_app_permission(company_id, 'finance.view')
    )
  );

DROP POLICY IF EXISTS financial_entries_insert ON public.financial_entries;
DROP POLICY IF EXISTS financial_entries_insert_permission ON public.financial_entries;
CREATE POLICY financial_entries_insert ON public.financial_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
    AND (
      private.is_company_owner_or_admin(company_id)
      OR private.has_app_permission(company_id, 'finance.create')
    )
  );

DROP POLICY IF EXISTS financial_entries_update ON public.financial_entries;
DROP POLICY IF EXISTS financial_entries_update_permission ON public.financial_entries;
CREATE POLICY financial_entries_update ON public.financial_entries
  FOR UPDATE
  TO authenticated
  USING (
    private.is_company_member(company_id)
    AND (
      private.is_company_owner_or_admin(company_id)
      OR private.has_app_permission(company_id, 'finance.edit')
    )
  )
  WITH CHECK (
    private.is_company_member(company_id)
    AND (
      private.is_company_owner_or_admin(company_id)
      OR private.has_app_permission(company_id, 'finance.edit')
    )
  );
