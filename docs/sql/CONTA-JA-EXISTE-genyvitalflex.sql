-- =============================================================================
-- PetGestor — este Gmail JÁ TEM CONTA CONFIRMADA (não use /cadastro)
-- E-mail: genyvitalflexpddro@gmail.com
-- Cole no Supabase → SQL Editor → Run
-- =============================================================================

-- 1) Confirma conta Auth
SELECT id, email, email_confirmed_at, invited_at, last_sign_in_at
FROM auth.users
WHERE lower(email) = 'genyvitalflexpddro@gmail.com';

-- 2) Convites (pending / accepted / etc.)
SELECT id, email, status, expires_at, company_id, employee_id, accepted_at
FROM public.company_member_invites
WHERE lower(email) = 'genyvitalflexpddro@gmail.com'
ORDER BY created_at DESC;

-- 3) Já é membro de alguma empresa?
SELECT cm.company_id, c.name AS company_name, cm.role, cm.employee_id, cm.access_revoked_at
FROM public.company_members cm
JOIN public.companies c ON c.id = cm.company_id
JOIN auth.users u ON u.id = cm.user_id
WHERE lower(u.email) = 'genyvitalflexpddro@gmail.com';

-- 4) Vincula na hora (equivalente ao “Dar acesso” quando a conta já está confirmada)
--    Ajuste o nome do funcionário se não for Kleber.
DO $$
DECLARE
  v_email text := 'genyvitalflexpddro@gmail.com';
  v_user_id uuid;
  v_employee_id uuid;
  v_company_id uuid;
  v_owner_id uuid;
BEGIN
  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_email
    AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Conta Auth não encontrada/confirmada para %', v_email;
  END IF;

  SELECT e.id, e.company_id
  INTO v_employee_id, v_company_id
  FROM public.employees e
  WHERE e.deleted_at IS NULL
    AND (
      lower(trim(coalesce(e.email, ''))) = v_email
      OR lower(e.name) LIKE '%kleber%'
    )
  ORDER BY
    CASE WHEN lower(trim(coalesce(e.email, ''))) = v_email THEN 0 ELSE 1 END,
    e.created_at DESC
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado. Coloque o e-mail na ficha e rode de novo.';
  END IF;

  SELECT cm.user_id INTO v_owner_id
  FROM public.company_members cm
  WHERE cm.company_id = v_company_id
    AND cm.role = 'owner'
    AND cm.access_revoked_at IS NULL
  LIMIT 1;

  UPDATE public.employees
  SET email = v_email, user_id = v_user_id
  WHERE id = v_employee_id AND company_id = v_company_id;

  INSERT INTO public.company_members (
    company_id, user_id, role, access_profile, permissions,
    employee_id, own_schedule_only, access_revoked_at
  ) VALUES (
    v_company_id, v_user_id, 'staff', 'reception', '[]'::jsonb,
    v_employee_id, false, NULL
  )
  ON CONFLICT (company_id, user_id) DO UPDATE
  SET
    access_profile = EXCLUDED.access_profile,
    employee_id = EXCLUDED.employee_id,
    access_revoked_at = NULL,
    updated_at = now()
  WHERE public.company_members.role <> 'owner';

  UPDATE public.company_member_invites
  SET status = 'accepted', accepted_at = now()
  WHERE company_id = v_company_id
    AND employee_id = v_employee_id
    AND status = 'pending';

  RAISE NOTICE 'OK: % vinculado ao funcionário % na empresa %', v_email, v_employee_id, v_company_id;
END;
$$;

-- 5) Atualiza a mensagem do lookup (conta existente → usar login)
CREATE OR REPLACE FUNCTION public.lookup_pending_invite_by_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_email text;
  v_invite record;
  v_company_name text;
  v_has_confirmed_account boolean;
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
    SELECT EXISTS (
      SELECT 1 FROM auth.users u
      WHERE lower(u.email) = v_email AND u.email_confirmed_at IS NOT NULL
    ) INTO v_has_confirmed_account;

    IF v_has_confirmed_account THEN
      RETURN jsonb_build_object('found', false, 'reason', 'account_exists_use_login');
    END IF;

    RETURN jsonb_build_object('found', false, 'reason', 'no_pending_invite');
  END IF;

  SELECT c.name INTO v_company_name FROM public.companies c WHERE c.id = v_invite.company_id;

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

-- 6) Conferência
SELECT public.lookup_pending_invite_by_email('genyvitalflexpddro@gmail.com') AS lookup_result;
