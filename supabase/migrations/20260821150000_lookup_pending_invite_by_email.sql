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
