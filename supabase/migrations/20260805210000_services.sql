-- PetGestor — Etapa 5: serviços (fixed e by_size)

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  pricing_mode text NOT NULL DEFAULT 'fixed',
  price_cents integer,
  duration_minutes integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT services_name_length CHECK (
    char_length(trim(name)) >= 2
    AND char_length(name) <= 120
  ),
  CONSTRAINT services_description_length CHECK (
    description IS NULL
    OR char_length(description) <= 2000
  ),
  CONSTRAINT services_pricing_mode_check CHECK (
    pricing_mode IN ('fixed', 'by_size')
  ),
  CONSTRAINT services_price_cents_check CHECK (
    price_cents IS NULL
    OR (price_cents >= 0 AND price_cents <= 999999)
  ),
  CONSTRAINT services_duration_minutes_check CHECK (
    duration_minutes >= 5
    AND duration_minutes <= 720
  ),
  CONSTRAINT services_fixed_price_check CHECK (
    pricing_mode <> 'fixed'
    OR price_cents IS NOT NULL
  ),
  CONSTRAINT services_id_company_id_key UNIQUE (id, company_id)
);

-- ---------------------------------------------------------------------------
-- service_size_prices
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_size_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  service_id uuid NOT NULL,
  size text NOT NULL,
  price_cents integer NOT NULL,
  duration_minutes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_size_prices_size_check CHECK (
    size IN ('small', 'medium', 'large', 'giant')
  ),
  CONSTRAINT service_size_prices_price_cents_check CHECK (
    price_cents >= 0
    AND price_cents <= 999999
  ),
  CONSTRAINT service_size_prices_duration_minutes_check CHECK (
    duration_minutes >= 5
    AND duration_minutes <= 720
  ),
  CONSTRAINT service_size_prices_service_size_key UNIQUE (service_id, size),
  CONSTRAINT service_size_prices_service_company_fkey
    FOREIGN KEY (service_id, company_id)
    REFERENCES public.services (id, company_id)
    ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_services_company_id
  ON public.services (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_services_company_name
  ON public.services (company_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_services_company_active
  ON public.services (company_id, active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_services_company_created_at
  ON public.services (company_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_size_prices_service_id
  ON public.service_size_prices (service_id);

CREATE INDEX IF NOT EXISTS idx_service_size_prices_company_id
  ON public.service_size_prices (company_id);

CREATE INDEX IF NOT EXISTS idx_service_size_prices_service_size
  ON public.service_size_prices (service_id, size);

-- ---------------------------------------------------------------------------
-- Triggers updated_at + company_id imutável
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS services_set_updated_at ON public.services;
CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS service_size_prices_set_updated_at ON public.service_size_prices;
CREATE TRIGGER service_size_prices_set_updated_at
  BEFORE UPDATE ON public.service_size_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS services_prevent_company_change ON public.services;
CREATE TRIGGER services_prevent_company_change
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS service_size_prices_prevent_company_change ON public.service_size_prices;
CREATE TRIGGER service_size_prices_prevent_company_change
  BEFORE UPDATE ON public.service_size_prices
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

-- ---------------------------------------------------------------------------
-- Row Level Security — services
-- ---------------------------------------------------------------------------

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select_member ON public.services;
CREATE POLICY services_select_member
  ON public.services
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS services_insert_member ON public.services;
CREATE POLICY services_insert_member
  ON public.services
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS services_update_member ON public.services;
CREATE POLICY services_update_member
  ON public.services
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Row Level Security — service_size_prices
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_size_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_size_prices_select_member ON public.service_size_prices;
CREATE POLICY service_size_prices_select_member
  ON public.service_size_prices
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_size_prices_insert_member ON public.service_size_prices;
CREATE POLICY service_size_prices_insert_member
  ON public.service_size_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_size_prices_update_member ON public.service_size_prices;
CREATE POLICY service_size_prices_update_member
  ON public.service_size_prices
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_size_prices_delete_member ON public.service_size_prices;
CREATE POLICY service_size_prices_delete_member
  ON public.service_size_prices
  FOR DELETE
  TO authenticated
  USING (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- RPC: create_service_with_prices (transacional)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_service_with_prices(
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean DEFAULT true,
  p_size_prices jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_service_id uuid;
  v_name text;
  v_description text;
  v_min_duration integer;
  v_item jsonb;
  v_size text;
  v_sizes text[] := ARRAY[]::text[];
  v_required_sizes text[] := ARRAY['small', 'medium', 'large', 'giant'];
  v_required_size text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

  SELECT cm.company_id
  INTO v_company_id
  FROM public.company_members cm
  WHERE cm.user_id = v_user_id
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required'
      USING ERRCODE = '42501';
  END IF;

  v_name := trim(p_name);
  v_description := nullif(trim(coalesce(p_description, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 2000 THEN
    RAISE EXCEPTION 'invalid_description'
      USING ERRCODE = '22023';
  END IF;

  IF p_pricing_mode NOT IN ('fixed', 'by_size') THEN
    RAISE EXCEPTION 'invalid_pricing_mode'
      USING ERRCODE = '22023';
  END IF;

  IF p_pricing_mode = 'fixed' THEN
    IF p_price_cents IS NULL OR p_price_cents < 0 OR p_price_cents > 999999 THEN
      RAISE EXCEPTION 'invalid_price_cents'
        USING ERRCODE = '22023';
    END IF;

    IF p_duration_minutes IS NULL
      OR p_duration_minutes < 5
      OR p_duration_minutes > 720 THEN
      RAISE EXCEPTION 'invalid_duration_minutes'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.services (
      company_id,
      name,
      description,
      pricing_mode,
      price_cents,
      duration_minutes,
      active,
      created_by
    ) VALUES (
      v_company_id,
      v_name,
      v_description,
      'fixed',
      p_price_cents,
      p_duration_minutes,
      coalesce(p_active, true),
      v_user_id
    )
    RETURNING id INTO v_service_id;

    RETURN v_service_id;
  END IF;

  IF p_size_prices IS NULL OR jsonb_typeof(p_size_prices) <> 'array' OR jsonb_array_length(p_size_prices) <> 4 THEN
    RAISE EXCEPTION 'invalid_size_prices'
      USING ERRCODE = '22023';
  END IF;

  v_min_duration := NULL;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_size_prices)
  LOOP
    v_size := v_item->>'size';

    IF v_size IS NULL OR v_size NOT IN ('small', 'medium', 'large', 'giant') THEN
      RAISE EXCEPTION 'invalid_size'
        USING ERRCODE = '22023';
    END IF;

    IF (v_item->>'price_cents')::integer IS NULL
      OR (v_item->>'price_cents')::integer < 0
      OR (v_item->>'price_cents')::integer > 999999 THEN
      RAISE EXCEPTION 'invalid_size_price_cents'
        USING ERRCODE = '22023';
    END IF;

    IF (v_item->>'duration_minutes')::integer IS NULL
      OR (v_item->>'duration_minutes')::integer < 5
      OR (v_item->>'duration_minutes')::integer > 720 THEN
      RAISE EXCEPTION 'invalid_size_duration_minutes'
        USING ERRCODE = '22023';
    END IF;

    IF v_size = ANY (v_sizes) THEN
      RAISE EXCEPTION 'duplicate_size'
        USING ERRCODE = '22023';
    END IF;

    v_sizes := array_append(v_sizes, v_size);

    IF v_min_duration IS NULL OR (v_item->>'duration_minutes')::integer < v_min_duration THEN
      v_min_duration := (v_item->>'duration_minutes')::integer;
    END IF;
  END LOOP;

  FOREACH v_required_size IN ARRAY v_required_sizes
  LOOP
    IF NOT (v_required_size = ANY (v_sizes)) THEN
      RAISE EXCEPTION 'missing_size'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.services (
    company_id,
    name,
    description,
    pricing_mode,
    price_cents,
    duration_minutes,
    active,
    created_by
  ) VALUES (
    v_company_id,
    v_name,
    v_description,
    'by_size',
    NULL,
    v_min_duration,
    coalesce(p_active, true),
    v_user_id
  )
  RETURNING id INTO v_service_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_size_prices)
  LOOP
    INSERT INTO public.service_size_prices (
      company_id,
      service_id,
      size,
      price_cents,
      duration_minutes
    ) VALUES (
      v_company_id,
      v_service_id,
      v_item->>'size',
      (v_item->>'price_cents')::integer,
      (v_item->>'duration_minutes')::integer
    );
  END LOOP;

  RETURN v_service_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_service_with_prices (transacional, inclui troca de pricing_mode)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_service_with_prices(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_name text;
  v_description text;
  v_min_duration integer;
  v_item jsonb;
  v_size text;
  v_sizes text[] := ARRAY[]::text[];
  v_required_sizes text[] := ARRAY['small', 'medium', 'large', 'giant'];
  v_required_size text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

  SELECT cm.company_id
  INTO v_company_id
  FROM public.company_members cm
  WHERE cm.user_id = v_user_id
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = p_service_id
      AND s.company_id = v_company_id
      AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'service_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_name := trim(p_name);
  v_description := nullif(trim(coalesce(p_description, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 2000 THEN
    RAISE EXCEPTION 'invalid_description'
      USING ERRCODE = '22023';
  END IF;

  IF p_pricing_mode NOT IN ('fixed', 'by_size') THEN
    RAISE EXCEPTION 'invalid_pricing_mode'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.service_size_prices
  WHERE service_id = p_service_id
    AND company_id = v_company_id;

  IF p_pricing_mode = 'fixed' THEN
    IF p_price_cents IS NULL OR p_price_cents < 0 OR p_price_cents > 999999 THEN
      RAISE EXCEPTION 'invalid_price_cents'
        USING ERRCODE = '22023';
    END IF;

    IF p_duration_minutes IS NULL
      OR p_duration_minutes < 5
      OR p_duration_minutes > 720 THEN
      RAISE EXCEPTION 'invalid_duration_minutes'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.services
    SET
      name = v_name,
      description = v_description,
      pricing_mode = 'fixed',
      price_cents = p_price_cents,
      duration_minutes = p_duration_minutes,
      active = coalesce(p_active, true)
    WHERE id = p_service_id
      AND company_id = v_company_id
      AND deleted_at IS NULL;

    RETURN p_service_id;
  END IF;

  IF p_size_prices IS NULL OR jsonb_typeof(p_size_prices) <> 'array' OR jsonb_array_length(p_size_prices) <> 4 THEN
    RAISE EXCEPTION 'invalid_size_prices'
      USING ERRCODE = '22023';
  END IF;

  v_min_duration := NULL;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_size_prices)
  LOOP
    v_size := v_item->>'size';

    IF v_size IS NULL OR v_size NOT IN ('small', 'medium', 'large', 'giant') THEN
      RAISE EXCEPTION 'invalid_size'
        USING ERRCODE = '22023';
    END IF;

    IF (v_item->>'price_cents')::integer IS NULL
      OR (v_item->>'price_cents')::integer < 0
      OR (v_item->>'price_cents')::integer > 999999 THEN
      RAISE EXCEPTION 'invalid_size_price_cents'
        USING ERRCODE = '22023';
    END IF;

    IF (v_item->>'duration_minutes')::integer IS NULL
      OR (v_item->>'duration_minutes')::integer < 5
      OR (v_item->>'duration_minutes')::integer > 720 THEN
      RAISE EXCEPTION 'invalid_size_duration_minutes'
        USING ERRCODE = '22023';
    END IF;

    IF v_size = ANY (v_sizes) THEN
      RAISE EXCEPTION 'duplicate_size'
        USING ERRCODE = '22023';
    END IF;

    v_sizes := array_append(v_sizes, v_size);

    IF v_min_duration IS NULL OR (v_item->>'duration_minutes')::integer < v_min_duration THEN
      v_min_duration := (v_item->>'duration_minutes')::integer;
    END IF;
  END LOOP;

  FOREACH v_required_size IN ARRAY v_required_sizes
  LOOP
    IF NOT (v_required_size = ANY (v_sizes)) THEN
      RAISE EXCEPTION 'missing_size'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  UPDATE public.services
  SET
    name = v_name,
    description = v_description,
    pricing_mode = 'by_size',
    price_cents = NULL,
    duration_minutes = v_min_duration,
    active = coalesce(p_active, true)
  WHERE id = p_service_id
    AND company_id = v_company_id
    AND deleted_at IS NULL;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_size_prices)
  LOOP
    INSERT INTO public.service_size_prices (
      company_id,
      service_id,
      size,
      price_cents,
      duration_minutes
    ) VALUES (
      v_company_id,
      p_service_id,
      v_item->>'size',
      (v_item->>'price_cents')::integer,
      (v_item->>'duration_minutes')::integer
    );
  END LOOP;

  RETURN p_service_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_service_with_prices(
  text, text, text, integer, integer, boolean, jsonb
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_service_with_prices(
  uuid, text, text, text, integer, integer, boolean, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_service_with_prices(
  text, text, text, integer, integer, boolean, jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_service_with_prices(
  uuid, text, text, text, integer, integer, boolean, jsonb
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_size_prices TO authenticated;
