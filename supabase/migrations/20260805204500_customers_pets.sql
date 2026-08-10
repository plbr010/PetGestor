-- PetGestor — Etapa 4: customers (tutores) e pets

-- ---------------------------------------------------------------------------
-- Proteção: company_id imutável
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.prevent_company_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id_immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT customers_name_length CHECK (
    char_length(trim(name)) >= 2
    AND char_length(name) <= 120
  ),
  CONSTRAINT customers_phone_length CHECK (
    char_length(phone) >= 10
    AND char_length(phone) <= 11
  ),
  CONSTRAINT customers_email_length CHECK (
    email IS NULL
    OR char_length(email) <= 254
  ),
  CONSTRAINT customers_notes_length CHECK (
    notes IS NULL
    OR char_length(notes) <= 2000
  ),
  CONSTRAINT customers_id_company_id_key UNIQUE (id, company_id)
);

-- ---------------------------------------------------------------------------
-- pets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  name text NOT NULL,
  species text NOT NULL,
  breed text,
  sex text NOT NULL DEFAULT 'unknown',
  birth_date date,
  weight_kg numeric(6, 2),
  color text,
  allergies text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT pets_name_length CHECK (
    char_length(trim(name)) >= 1
    AND char_length(name) <= 120
  ),
  CONSTRAINT pets_species_check CHECK (species IN ('dog', 'cat', 'other')),
  CONSTRAINT pets_sex_check CHECK (sex IN ('male', 'female', 'unknown')),
  CONSTRAINT pets_breed_length CHECK (
    breed IS NULL
    OR char_length(breed) <= 120
  ),
  CONSTRAINT pets_color_length CHECK (
    color IS NULL
    OR char_length(color) <= 120
  ),
  CONSTRAINT pets_allergies_length CHECK (
    allergies IS NULL
    OR char_length(allergies) <= 2000
  ),
  CONSTRAINT pets_notes_length CHECK (
    notes IS NULL
    OR char_length(notes) <= 2000
  ),
  CONSTRAINT pets_weight_kg_check CHECK (
    weight_kg IS NULL
    OR (weight_kg > 0 AND weight_kg <= 200)
  ),
  CONSTRAINT pets_customer_company_fkey
    FOREIGN KEY (customer_id, company_id)
    REFERENCES public.customers (id, company_id)
    ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_customers_company_id
  ON public.customers (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_company_name
  ON public.customers (company_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_company_phone
  ON public.customers (company_id, phone)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_company_created_at
  ON public.customers (company_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pets_company_id
  ON public.pets (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pets_customer_id
  ON public.pets (customer_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pets_company_name
  ON public.pets (company_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pets_company_species
  ON public.pets (company_id, species)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pets_company_created_at
  ON public.pets (company_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Triggers updated_at + company_id imutável
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS customers_set_updated_at ON public.customers;
CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS pets_set_updated_at ON public.pets;
CREATE TRIGGER pets_set_updated_at
  BEFORE UPDATE ON public.pets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS customers_prevent_company_change ON public.customers;
CREATE TRIGGER customers_prevent_company_change
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS pets_prevent_company_change ON public.pets;
CREATE TRIGGER pets_prevent_company_change
  BEFORE UPDATE ON public.pets
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

-- ---------------------------------------------------------------------------
-- Row Level Security — customers
-- ---------------------------------------------------------------------------

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select_member ON public.customers;
CREATE POLICY customers_select_member
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS customers_insert_member ON public.customers;
CREATE POLICY customers_insert_member
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS customers_update_member ON public.customers;
CREATE POLICY customers_update_member
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Row Level Security — pets
-- ---------------------------------------------------------------------------

ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pets_select_member ON public.pets;
CREATE POLICY pets_select_member
  ON public.pets
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS pets_insert_member ON public.pets;
CREATE POLICY pets_insert_member
  ON public.pets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS pets_update_member ON public.pets;
CREATE POLICY pets_update_member
  ON public.pets
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pets TO authenticated;
