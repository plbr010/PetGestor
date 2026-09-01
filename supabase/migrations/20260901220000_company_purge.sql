-- PetGestor — purge administrativo de empresa (contas demo)
-- Permite apagar stock_movements imutáveis durante remoção controlada de tenant.

CREATE OR REPLACE FUNCTION private.prevent_stock_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('petgestor.company_purge', true) = 'on'
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'stock_movements_immutable'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION private.purge_company_hard(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'invalid_company_id'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id) THEN
    RETURN;
  END IF;

  PERFORM set_config('petgestor.company_purge', 'on', true);

  DELETE FROM public.stock_movements
  WHERE company_id = p_company_id;

  DELETE FROM public.companies
  WHERE id = p_company_id;

  PERFORM set_config('petgestor.company_purge', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_company_for_platform_admin(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
BEGIN
  PERFORM private.purge_company_hard(p_company_id);
END;
$$;

REVOKE ALL ON FUNCTION private.purge_company_hard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_company_for_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_company_for_platform_admin(uuid) TO service_role;

COMMENT ON FUNCTION public.purge_company_for_platform_admin(uuid) IS
  'Remove empresa e dados em cascade, incluindo stock_movements imutáveis. Uso server-only (service role).';
