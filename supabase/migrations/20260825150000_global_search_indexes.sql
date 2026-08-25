-- PetGestor — índices e helper para busca global (ilike / telefone / acentos PT)
-- Sem Elasticsearch. company_id sempre filtrado nas queries da app.

CREATE OR REPLACE FUNCTION private.fold_pt(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    translate(
      coalesce(t, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )
  );
$$;

REVOKE ALL ON FUNCTION private.fold_pt(text) FROM PUBLIC;

-- Trigram acelera ILIKE '%termo%' nos campos mais buscados
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON public.customers USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_email_trgm
  ON public.customers USING gin (email gin_trgm_ops)
  WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pets_name_trgm
  ON public.pets USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pets_breed_trgm
  ON public.pets USING gin (breed gin_trgm_ops)
  WHERE deleted_at IS NULL AND breed IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_name_trgm
  ON public.employees USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_services_name_trgm
  ON public.services USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name gin_trgm_ops)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
  ON public.products USING gin (sku gin_trgm_ops)
  WHERE archived_at IS NULL AND sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm
  ON public.products USING gin (barcode gin_trgm_ops)
  WHERE archived_at IS NULL AND barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_service_name_trgm
  ON public.appointments USING gin (service_name_snapshot gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_packages_name_trgm
  ON public.service_packages USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customer_service_packages_name_trgm
  ON public.customer_service_packages USING gin (package_name_snapshot gin_trgm_ops);
