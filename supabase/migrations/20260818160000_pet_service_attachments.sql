-- PetGestor — fotos e anexos de pets e atendimentos (Storage privado)
-- MIGRATION PENDENTE — aplicar após migrations anteriores

-- ---------------------------------------------------------------------------
-- pets: foto principal
-- ---------------------------------------------------------------------------

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS photo_storage_path text;

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS photo_thumb_path text;

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS photo_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- pets: UNIQUE composto para FK anexos → pet+empresa
-- (id já é PK; par com company_id segue padrão multi-tenant do projeto)
-- ---------------------------------------------------------------------------

-- Só cria a constraint se ainda não existir (re-run seguro quando anexos já existem)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pets_id_company_id_key'
      AND conrelid = 'public.pets'::regclass
  ) THEN
    ALTER TABLE public.pets
      ADD CONSTRAINT pets_id_company_id_key UNIQUE (id, company_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- pet_attachments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pet_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  pet_id uuid NOT NULL,
  file_path text NOT NULL,
  thumb_path text,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  category text NOT NULL,
  description text,
  uploaded_by uuid NOT NULL REFERENCES auth.users (id),
  uploaded_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users (id),
  CONSTRAINT pet_attachments_category_check CHECK (
    category IN ('vaccination_card', 'document', 'photo', 'report', 'other')
  ),
  CONSTRAINT pet_attachments_mime_check CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  CONSTRAINT pet_attachments_size_check CHECK (
    size_bytes > 0 AND size_bytes <= 10485760
  ),
  CONSTRAINT pet_attachments_file_name_length CHECK (
    char_length(trim(file_name)) >= 1 AND char_length(file_name) <= 255
  ),
  CONSTRAINT pet_attachments_description_length CHECK (
    description IS NULL OR char_length(description) <= 500
  ),
  CONSTRAINT pet_attachments_pet_company_fkey
    FOREIGN KEY (pet_id, company_id)
    REFERENCES public.pets (id, company_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_attachments_company_pet
  ON public.pet_attachments (company_id, pet_id, created_at DESC)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- service_order_attachments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_order_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL,
  pet_id uuid NOT NULL,
  file_path text NOT NULL,
  thumb_path text,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  category text NOT NULL,
  phase text,
  description text,
  uploaded_by uuid NOT NULL REFERENCES auth.users (id),
  uploaded_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users (id),
  CONSTRAINT service_order_attachments_category_check CHECK (
    category IN ('arrival', 'before', 'after', 'observation', 'other')
  ),
  CONSTRAINT service_order_attachments_phase_check CHECK (
    phase IS NULL OR phase IN ('before', 'after')
  ),
  CONSTRAINT service_order_attachments_mime_check CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  CONSTRAINT service_order_attachments_size_check CHECK (
    size_bytes > 0 AND size_bytes <= 10485760
  ),
  CONSTRAINT service_order_attachments_file_name_length CHECK (
    char_length(trim(file_name)) >= 1 AND char_length(file_name) <= 255
  ),
  CONSTRAINT service_order_attachments_description_length CHECK (
    description IS NULL OR char_length(description) <= 500
  ),
  CONSTRAINT service_order_attachments_order_company_fkey
    FOREIGN KEY (service_order_id, company_id)
    REFERENCES public.service_orders (id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT service_order_attachments_pet_company_fkey
    FOREIGN KEY (pet_id, company_id)
    REFERENCES public.pets (id, company_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_order_attachments_order
  ON public.service_order_attachments (company_id, service_order_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_order_attachments_pet_gallery
  ON public.service_order_attachments (company_id, pet_id, created_at DESC)
  WHERE archived_at IS NULL AND mime_type <> 'application/pdf';

-- ---------------------------------------------------------------------------
-- RLS — tabelas
-- ---------------------------------------------------------------------------

ALTER TABLE public.pet_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pet_attachments_select_member ON public.pet_attachments;
CREATE POLICY pet_attachments_select_member ON public.pet_attachments
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS pet_attachments_insert_member ON public.pet_attachments;
CREATE POLICY pet_attachments_insert_member ON public.pet_attachments
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS pet_attachments_update_member ON public.pet_attachments;
CREATE POLICY pet_attachments_update_member ON public.pet_attachments
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_order_attachments_select_member ON public.service_order_attachments;
CREATE POLICY service_order_attachments_select_member ON public.service_order_attachments
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_order_attachments_insert_member ON public.service_order_attachments;
CREATE POLICY service_order_attachments_insert_member ON public.service_order_attachments
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS service_order_attachments_update_member ON public.service_order_attachments;
CREATE POLICY service_order_attachments_update_member ON public.service_order_attachments
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.pet_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.service_order_attachments TO authenticated;

DROP TRIGGER IF EXISTS pet_attachments_prevent_company_change ON public.pet_attachments;
CREATE TRIGGER pet_attachments_prevent_company_change
  BEFORE UPDATE ON public.pet_attachments
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS service_order_attachments_prevent_company_change ON public.service_order_attachments;
CREATE TRIGGER service_order_attachments_prevent_company_change
  BEFORE UPDATE ON public.service_order_attachments
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

-- ---------------------------------------------------------------------------
-- Supabase Storage — bucket privado
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-files',
  'company-files',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS company_files_select ON storage.objects;
CREATE POLICY company_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND private.is_company_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS company_files_insert ON storage.objects;
CREATE POLICY company_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND private.is_company_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS company_files_update ON storage.objects;
CREATE POLICY company_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND private.is_company_member(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND private.is_company_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS company_files_delete ON storage.objects;
CREATE POLICY company_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND private.is_company_member(((storage.foldername(name))[1])::uuid)
  );
