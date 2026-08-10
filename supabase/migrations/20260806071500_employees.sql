-- PetGestor — Etapa 6: funcionários (employees)

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  job_title text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  can_be_scheduled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT employees_name_length CHECK (
    char_length(trim(name)) >= 2
    AND char_length(name) <= 120
  ),
  CONSTRAINT employees_phone_length CHECK (
    phone IS NULL
    OR (char_length(phone) >= 10 AND char_length(phone) <= 11)
  ),
  CONSTRAINT employees_email_length CHECK (
    email IS NULL
    OR char_length(email) <= 254
  ),
  CONSTRAINT employees_job_title_length CHECK (
    job_title IS NULL
    OR char_length(job_title) <= 80
  ),
  CONSTRAINT employees_notes_length CHECK (
    notes IS NULL
    OR char_length(notes) <= 2000
  ),
  CONSTRAINT employees_id_company_id_key UNIQUE (id, company_id)
);

-- ---------------------------------------------------------------------------
-- employee_services
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_services (
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  service_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, service_id),
  CONSTRAINT employee_services_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees (id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT employee_services_service_company_fkey
    FOREIGN KEY (service_id, company_id)
    REFERENCES public.services (id, company_id)
    ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- employee_working_hours
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  weekday smallint NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  start_time time,
  end_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_working_hours_weekday_check CHECK (
    weekday >= 0
    AND weekday <= 6
  ),
  CONSTRAINT employee_working_hours_employee_weekday_key UNIQUE (employee_id, weekday),
  CONSTRAINT employee_working_hours_enabled_times_check CHECK (
    (enabled = false)
    OR (
      start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND start_time < end_time
    )
  ),
  CONSTRAINT employee_working_hours_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees (id, company_id)
    ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_employees_company_id
  ON public.employees (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_company_name
  ON public.employees (company_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_company_active
  ON public.employees (company_id, active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_company_can_be_scheduled
  ON public.employees (company_id, can_be_scheduled)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_services_employee_id
  ON public.employee_services (employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_services_service_id
  ON public.employee_services (service_id);

CREATE INDEX IF NOT EXISTS idx_employee_services_company_id
  ON public.employee_services (company_id);

CREATE INDEX IF NOT EXISTS idx_employee_working_hours_employee_id
  ON public.employee_working_hours (employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_working_hours_company_weekday
  ON public.employee_working_hours (company_id, weekday);

-- ---------------------------------------------------------------------------
-- Triggers updated_at + company_id imutável
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS employees_set_updated_at ON public.employees;
CREATE TRIGGER employees_set_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS employee_working_hours_set_updated_at ON public.employee_working_hours;
CREATE TRIGGER employee_working_hours_set_updated_at
  BEFORE UPDATE ON public.employee_working_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS employees_prevent_company_change ON public.employees;
CREATE TRIGGER employees_prevent_company_change
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS employee_services_prevent_company_change ON public.employee_services;
CREATE TRIGGER employee_services_prevent_company_change
  BEFORE UPDATE ON public.employee_services
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS employee_working_hours_prevent_company_change ON public.employee_working_hours;
CREATE TRIGGER employee_working_hours_prevent_company_change
  BEFORE UPDATE ON public.employee_working_hours
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

-- ---------------------------------------------------------------------------
-- Row Level Security — employees
-- ---------------------------------------------------------------------------

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_select_member ON public.employees;
CREATE POLICY employees_select_member
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS employees_insert_member ON public.employees;
CREATE POLICY employees_insert_member
  ON public.employees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS employees_update_member ON public.employees;
CREATE POLICY employees_update_member
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Row Level Security — employee_services
-- ---------------------------------------------------------------------------

ALTER TABLE public.employee_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_services_select_member ON public.employee_services;
CREATE POLICY employee_services_select_member
  ON public.employee_services
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS employee_services_insert_member ON public.employee_services;
CREATE POLICY employee_services_insert_member
  ON public.employee_services
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS employee_services_delete_member ON public.employee_services;
CREATE POLICY employee_services_delete_member
  ON public.employee_services
  FOR DELETE
  TO authenticated
  USING (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Row Level Security — employee_working_hours
-- ---------------------------------------------------------------------------

ALTER TABLE public.employee_working_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_working_hours_select_member ON public.employee_working_hours;
CREATE POLICY employee_working_hours_select_member
  ON public.employee_working_hours
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS employee_working_hours_insert_member ON public.employee_working_hours;
CREATE POLICY employee_working_hours_insert_member
  ON public.employee_working_hours
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS employee_working_hours_update_member ON public.employee_working_hours;
CREATE POLICY employee_working_hours_update_member
  ON public.employee_working_hours
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS employee_working_hours_delete_member ON public.employee_working_hours;
CREATE POLICY employee_working_hours_delete_member
  ON public.employee_working_hours
  FOR DELETE
  TO authenticated
  USING (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- RPC: create_employee_with_schedule
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_employee_with_schedule(
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean DEFAULT true,
  p_can_be_scheduled boolean DEFAULT true,
  p_service_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_working_hours jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_employee_id uuid;
  v_name text;
  v_phone text;
  v_email text;
  v_job_title text;
  v_notes text;
  v_item jsonb;
  v_weekday smallint;
  v_service_id uuid;
  v_distinct_services integer;
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
  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_job_title := nullif(trim(coalesce(p_job_title, '')), '');
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND (char_length(v_phone) < 10 OR char_length(v_phone) > 11) THEN
    RAISE EXCEPTION 'invalid_phone'
      USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL AND char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email'
      USING ERRCODE = '22023';
  END IF;

  IF v_job_title IS NOT NULL AND char_length(v_job_title) > 80 THEN
    RAISE EXCEPTION 'invalid_job_title'
      USING ERRCODE = '22023';
  END IF;

  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'invalid_notes'
      USING ERRCODE = '22023';
  END IF;

  IF p_working_hours IS NULL OR jsonb_typeof(p_working_hours) <> 'array' THEN
    RAISE EXCEPTION 'invalid_working_hours'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    v_weekday := (v_item->>'weekday')::smallint;

    IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
      RAISE EXCEPTION 'invalid_weekday'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce((v_item->>'enabled')::boolean, false) THEN
      IF (v_item->>'start_time') IS NULL OR (v_item->>'end_time') IS NULL THEN
        RAISE EXCEPTION 'missing_working_hours'
          USING ERRCODE = '22023';
      END IF;

      IF (v_item->>'start_time')::time >= (v_item->>'end_time')::time THEN
        RAISE EXCEPTION 'invalid_time_range'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
    SELECT count(DISTINCT s.id)
    INTO v_distinct_services
    FROM public.services s
    WHERE s.company_id = v_company_id
      AND s.deleted_at IS NULL
      AND s.active = true
      AND s.id = ANY (p_service_ids);

    IF v_distinct_services <> (
      SELECT count(DISTINCT unnest_id)
      FROM unnest(p_service_ids) AS unnest_id
    ) THEN
      RAISE EXCEPTION 'invalid_service_ids'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.employees (
    company_id,
    name,
    phone,
    email,
    job_title,
    notes,
    active,
    can_be_scheduled,
    created_by
  ) VALUES (
    v_company_id,
    v_name,
    v_phone,
    v_email,
    v_job_title,
    v_notes,
    coalesce(p_active, true),
    coalesce(p_can_be_scheduled, true),
    v_user_id
  )
  RETURNING id INTO v_employee_id;

  IF p_service_ids IS NOT NULL THEN
    FOREACH v_service_id IN ARRAY p_service_ids
    LOOP
      INSERT INTO public.employee_services (company_id, employee_id, service_id)
      VALUES (v_company_id, v_employee_id, v_service_id);
    END LOOP;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    INSERT INTO public.employee_working_hours (
      company_id,
      employee_id,
      weekday,
      enabled,
      start_time,
      end_time
    ) VALUES (
      v_company_id,
      v_employee_id,
      (v_item->>'weekday')::smallint,
      coalesce((v_item->>'enabled')::boolean, false),
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
        THEN (v_item->>'start_time')::time
        ELSE NULL
      END,
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
        THEN (v_item->>'end_time')::time
        ELSE NULL
      END
    );
  END LOOP;

  RETURN v_employee_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_employee_with_schedule
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_employee_with_schedule(
  p_employee_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean,
  p_can_be_scheduled boolean,
  p_service_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_working_hours jsonb DEFAULT '[]'::jsonb
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
  v_phone text;
  v_email text;
  v_job_title text;
  v_notes text;
  v_item jsonb;
  v_weekday smallint;
  v_service_id uuid;
  v_distinct_services integer;
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
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.company_id = v_company_id
      AND e.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'employee_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_name := trim(p_name);
  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_job_title := nullif(trim(coalesce(p_job_title, '')), '');
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND (char_length(v_phone) < 10 OR char_length(v_phone) > 11) THEN
    RAISE EXCEPTION 'invalid_phone'
      USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL AND char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email'
      USING ERRCODE = '22023';
  END IF;

  IF v_job_title IS NOT NULL AND char_length(v_job_title) > 80 THEN
    RAISE EXCEPTION 'invalid_job_title'
      USING ERRCODE = '22023';
  END IF;

  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'invalid_notes'
      USING ERRCODE = '22023';
  END IF;

  IF p_working_hours IS NULL OR jsonb_typeof(p_working_hours) <> 'array' THEN
    RAISE EXCEPTION 'invalid_working_hours'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    v_weekday := (v_item->>'weekday')::smallint;

    IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
      RAISE EXCEPTION 'invalid_weekday'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce((v_item->>'enabled')::boolean, false) THEN
      IF (v_item->>'start_time') IS NULL OR (v_item->>'end_time') IS NULL THEN
        RAISE EXCEPTION 'missing_working_hours'
          USING ERRCODE = '22023';
      END IF;

      IF (v_item->>'start_time')::time >= (v_item->>'end_time')::time THEN
        RAISE EXCEPTION 'invalid_time_range'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
    SELECT count(DISTINCT s.id)
    INTO v_distinct_services
    FROM public.services s
    WHERE s.company_id = v_company_id
      AND s.deleted_at IS NULL
      AND s.active = true
      AND s.id = ANY (p_service_ids);

    IF v_distinct_services <> (
      SELECT count(DISTINCT unnest_id)
      FROM unnest(p_service_ids) AS unnest_id
    ) THEN
      RAISE EXCEPTION 'invalid_service_ids'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.employees
  SET
    name = v_name,
    phone = v_phone,
    email = v_email,
    job_title = v_job_title,
    notes = v_notes,
    active = coalesce(p_active, true),
    can_be_scheduled = coalesce(p_can_be_scheduled, true)
  WHERE id = p_employee_id
    AND company_id = v_company_id
    AND deleted_at IS NULL;

  DELETE FROM public.employee_services
  WHERE employee_id = p_employee_id
    AND company_id = v_company_id;

  IF p_service_ids IS NOT NULL THEN
    FOREACH v_service_id IN ARRAY p_service_ids
    LOOP
      INSERT INTO public.employee_services (company_id, employee_id, service_id)
      VALUES (v_company_id, p_employee_id, v_service_id);
    END LOOP;
  END IF;

  DELETE FROM public.employee_working_hours
  WHERE employee_id = p_employee_id
    AND company_id = v_company_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    INSERT INTO public.employee_working_hours (
      company_id,
      employee_id,
      weekday,
      enabled,
      start_time,
      end_time
    ) VALUES (
      v_company_id,
      p_employee_id,
      (v_item->>'weekday')::smallint,
      coalesce((v_item->>'enabled')::boolean, false),
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
        THEN (v_item->>'start_time')::time
        ELSE NULL
      END,
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
        THEN (v_item->>'end_time')::time
        ELSE NULL
      END
    );
  END LOOP;

  RETURN p_employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_employee_with_schedule(
  text, text, text, text, text, boolean, boolean, uuid[], jsonb
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_employee_with_schedule(
  uuid, text, text, text, text, text, boolean, boolean, uuid[], jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_employee_with_schedule(
  text, text, text, text, text, boolean, boolean, uuid[], jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_employee_with_schedule(
  uuid, text, text, text, text, text, boolean, boolean, uuid[], jsonb
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.employee_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_working_hours TO authenticated;
