-- PetGestor — Etapa 3: autenticação multi-tenant
-- profiles → company_members → companies

-- ---------------------------------------------------------------------------
-- Schema privado para helpers (não exposto pela Data API)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_full_name_length CHECK (
    char_length(trim(full_name)) >= 2
    AND char_length(full_name) <= 120
  )
);

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_name_length CHECK (
    char_length(trim(name)) >= 2
    AND char_length(name) <= 120
  )
);

CREATE TABLE IF NOT EXISTS public.company_members (
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id),
  CONSTRAINT company_members_role_check CHECK (role IN ('owner', 'admin', 'staff'))
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_company_members_user_id
  ON public.company_members (user_id);

CREATE INDEX IF NOT EXISTS idx_company_members_company_id
  ON public.company_members (company_id);

CREATE INDEX IF NOT EXISTS idx_companies_created_by
  ON public.companies (created_by);

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS companies_set_updated_at ON public.companies;
CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers SECURITY DEFINER (evitam recursão em RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.has_company_role(p_company_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND role = ANY (p_roles)
  );
$$;

REVOKE ALL ON FUNCTION private.is_company_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_company_role(uuid, text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Onboarding atômico
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_full_name text,
  p_company_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_existing_company_id uuid;
  v_full_name text;
  v_company_name text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

  v_full_name := trim(p_full_name);
  v_company_name := trim(p_company_name);

  IF char_length(v_full_name) < 2 OR char_length(v_full_name) > 120 THEN
    RAISE EXCEPTION 'invalid_full_name'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(v_company_name) < 2 OR char_length(v_company_name) > 120 THEN
    RAISE EXCEPTION 'invalid_company_name'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_user_id, v_full_name)
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
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

REVOKE ALL ON FUNCTION public.complete_onboarding(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- companies
DROP POLICY IF EXISTS companies_select_member ON public.companies;
CREATE POLICY companies_select_member
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(id));

DROP POLICY IF EXISTS companies_update_owner_admin ON public.companies;
CREATE POLICY companies_update_owner_admin
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (private.has_company_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (private.has_company_role(id, ARRAY['owner', 'admin']));

-- company_members
DROP POLICY IF EXISTS company_members_select_member ON public.company_members;
CREATE POLICY company_members_select_member
  ON public.company_members
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Grants mínimos (RLS restringe linhas)
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.companies TO authenticated;
GRANT SELECT ON public.company_members TO authenticated;
