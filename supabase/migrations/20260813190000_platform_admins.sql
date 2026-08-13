-- PetGestor — Platform admins (painel interno)
-- Somente usuários registrados explicitamente em platform_admins
-- podem acessar o painel administrativo global.
-- Clientes comuns NÃO podem se promover a admin.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'platform_owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_admins_role_check CHECK (role IN ('platform_owner'))
);

COMMENT ON TABLE public.platform_admins IS
  'Administradores da plataforma PetGestor. Insert apenas via SQL privilegiado / service_role.';

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Leitura apenas da própria linha (para gate server-side com sessão do usuário).
-- Sem INSERT/UPDATE/DELETE para authenticated — impede auto-promoção.
CREATE POLICY platform_admins_select_own ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;
