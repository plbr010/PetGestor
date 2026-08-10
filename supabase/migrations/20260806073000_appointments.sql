-- PetGestor — Etapa 7: agenda (appointments)
-- MIGRATION PENDENTE — aplicar manualmente no Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- companies.timezone
-- ---------------------------------------------------------------------------

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.companies
  ADD CONSTRAINT companies_timezone_length CHECK (
    char_length(timezone) >= 3
    AND char_length(timezone) <= 64
  );

-- ---------------------------------------------------------------------------
-- pets: UNIQUE composto para FK appointment → pet+tutor
-- ---------------------------------------------------------------------------

ALTER TABLE public.pets
  ADD CONSTRAINT pets_id_customer_company_key UNIQUE (id, customer_id, company_id);

-- ---------------------------------------------------------------------------
-- employee_services: UNIQUE composto para FK appointment → employee+service
-- ---------------------------------------------------------------------------

ALTER TABLE public.employee_services
  ADD CONSTRAINT employee_services_employee_service_company_key
  UNIQUE (employee_id, service_id, company_id);

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  pet_id uuid NOT NULL,
  service_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  pet_size text,
  service_name_snapshot text NOT NULL,
  price_cents_snapshot integer NOT NULL,
  duration_minutes_snapshot integer NOT NULL,
  notes text,
  cancellation_reason text,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT appointments_status_check CHECK (
    status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')
  ),
  CONSTRAINT appointments_pet_size_check CHECK (
    pet_size IS NULL
    OR pet_size IN ('small', 'medium', 'large', 'giant')
  ),
  CONSTRAINT appointments_price_cents_snapshot_check CHECK (
    price_cents_snapshot >= 0
    AND price_cents_snapshot <= 999999
  ),
  CONSTRAINT appointments_duration_minutes_snapshot_check CHECK (
    duration_minutes_snapshot >= 5
    AND duration_minutes_snapshot <= 720
  ),
  CONSTRAINT appointments_scheduled_range_check CHECK (
    scheduled_end > scheduled_start
  ),
  CONSTRAINT appointments_notes_length CHECK (
    notes IS NULL
    OR char_length(notes) <= 2000
  ),
  CONSTRAINT appointments_cancellation_reason_length CHECK (
    cancellation_reason IS NULL
    OR char_length(cancellation_reason) <= 500
  ),
  CONSTRAINT appointments_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT appointments_pet_customer_company_fkey
    FOREIGN KEY (pet_id, customer_id, company_id)
    REFERENCES public.pets (id, customer_id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_customer_company_fkey
    FOREIGN KEY (customer_id, company_id)
    REFERENCES public.customers (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_service_company_fkey
    FOREIGN KEY (service_id, company_id)
    REFERENCES public.services (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_employee_service_company_fkey
    FOREIGN KEY (employee_id, service_id, company_id)
    REFERENCES public.employee_services (employee_id, service_id, company_id)
    ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- EXCLUDE: conflito de funcionário e pet (half-open range [))
-- ---------------------------------------------------------------------------

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_employee_overlap
  EXCLUDE USING gist (
    company_id WITH =,
    employee_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  )
  WHERE (
    status IN ('scheduled', 'confirmed', 'in_progress')
    AND deleted_at IS NULL
  );

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_pet_overlap
  EXCLUDE USING gist (
    company_id WITH =,
    pet_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  )
  WHERE (
    status IN ('scheduled', 'confirmed', 'in_progress')
    AND deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_appointments_company_scheduled_start
  ON public.appointments (company_id, scheduled_start)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_company_scheduled_end
  ON public.appointments (company_id, scheduled_end)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_company_employee_start
  ON public.appointments (company_id, employee_id, scheduled_start)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_company_pet_start
  ON public.appointments (company_id, pet_id, scheduled_start)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_company_status_start
  ON public.appointments (company_id, status, scheduled_start)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS appointments_set_updated_at ON public.appointments;
CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS appointments_prevent_company_change ON public.appointments;
CREATE TRIGGER appointments_prevent_company_change
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select_member ON public.appointments;
CREATE POLICY appointments_select_member
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS appointments_insert_member ON public.appointments;
CREATE POLICY appointments_insert_member
  ON public.appointments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS appointments_update_member ON public.appointments;
CREATE POLICY appointments_update_member
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;

-- ---------------------------------------------------------------------------
-- Helper: resolve company_id for authenticated user
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.get_auth_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
  SELECT cm.company_id
  FROM public.company_members cm
  WHERE cm.user_id = auth.uid()
  ORDER BY cm.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.get_auth_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_auth_company_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create_appointment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_appointment_id uuid;
  v_timezone text;
  v_customer_id uuid;
  v_service record;
  v_employee_id uuid;
  v_price_cents integer;
  v_duration_minutes integer;
  v_service_name text;
  v_scheduled_end timestamptz;
  v_weekday smallint;
  v_wh record;
  v_local_start time;
  v_local_end time;
  v_notes text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT c.timezone INTO v_timezone FROM public.companies c WHERE c.id = v_company_id;

  IF p_scheduled_start < now() THEN
    RAISE EXCEPTION 'appointment_in_past' USING ERRCODE = '22023';
  END IF;

  SELECT p.customer_id INTO v_customer_id
  FROM public.pets p
  WHERE p.id = p_pet_id AND p.company_id = v_company_id AND p.deleted_at IS NULL;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'pet_unavailable' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers cu
    WHERE cu.id = v_customer_id AND cu.company_id = v_company_id AND cu.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'customer_unavailable' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id, s.name, s.pricing_mode, s.price_cents, s.duration_minutes
  INTO v_service
  FROM public.services s
  WHERE s.id = p_service_id AND s.company_id = v_company_id
    AND s.deleted_at IS NULL AND s.active = true;

  IF v_service.id IS NULL THEN
    RAISE EXCEPTION 'service_unavailable' USING ERRCODE = 'P0002';
  END IF;

  SELECT e.id INTO v_employee_id
  FROM public.employees e
  WHERE e.id = p_employee_id AND e.company_id = v_company_id
    AND e.deleted_at IS NULL AND e.active = true AND e.can_be_scheduled = true;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_not_eligible' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employee_services es
    WHERE es.employee_id = p_employee_id AND es.service_id = p_service_id
      AND es.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'employee_service_mismatch' USING ERRCODE = '22023';
  END IF;

  v_service_name := v_service.name;

  IF v_service.pricing_mode = 'fixed' THEN
    v_price_cents := v_service.price_cents;
    v_duration_minutes := v_service.duration_minutes;
  ELSE
    IF p_pet_size IS NULL OR p_pet_size NOT IN ('small', 'medium', 'large', 'giant') THEN
      RAISE EXCEPTION 'invalid_pet_size' USING ERRCODE = '22023';
    END IF;
    SELECT sp.price_cents, sp.duration_minutes INTO v_price_cents, v_duration_minutes
    FROM public.service_size_prices sp
    WHERE sp.service_id = p_service_id AND sp.company_id = v_company_id AND sp.size = p_pet_size;
    IF v_price_cents IS NULL THEN
      RAISE EXCEPTION 'invalid_pet_size' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_scheduled_end := p_scheduled_start + make_interval(mins => v_duration_minutes);
  v_weekday := EXTRACT(DOW FROM timezone(v_timezone, p_scheduled_start))::smallint;

  SELECT ewh.enabled, ewh.start_time, ewh.end_time INTO v_wh
  FROM public.employee_working_hours ewh
  WHERE ewh.employee_id = p_employee_id AND ewh.company_id = v_company_id AND ewh.weekday = v_weekday;

  IF v_wh IS NULL OR v_wh.enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'outside_working_hours' USING ERRCODE = '22023';
  END IF;

  v_local_start := (timezone(v_timezone, p_scheduled_start))::time;
  v_local_end := (timezone(v_timezone, v_scheduled_end))::time;

  IF v_local_start < v_wh.start_time OR v_local_end > v_wh.end_time THEN
    RAISE EXCEPTION 'outside_working_hours' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.company_id = v_company_id AND a.employee_id = p_employee_id
      AND a.deleted_at IS NULL AND a.status IN ('scheduled', 'confirmed', 'in_progress')
      AND tstzrange(a.scheduled_start, a.scheduled_end, '[)') &&
          tstzrange(p_scheduled_start, v_scheduled_end, '[)')
  ) THEN
    RAISE EXCEPTION 'employee_schedule_conflict' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.company_id = v_company_id AND a.pet_id = p_pet_id
      AND a.deleted_at IS NULL AND a.status IN ('scheduled', 'confirmed', 'in_progress')
      AND tstzrange(a.scheduled_start, a.scheduled_end, '[)') &&
          tstzrange(p_scheduled_start, v_scheduled_end, '[)')
  ) THEN
    RAISE EXCEPTION 'pet_schedule_conflict' USING ERRCODE = '23505';
  END IF;

  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  INSERT INTO public.appointments (
    company_id, customer_id, pet_id, service_id, employee_id,
    scheduled_start, scheduled_end, status, pet_size,
    service_name_snapshot, price_cents_snapshot, duration_minutes_snapshot,
    notes, created_by
  ) VALUES (
    v_company_id, v_customer_id, p_pet_id, p_service_id, p_employee_id,
    p_scheduled_start, v_scheduled_end, 'scheduled',
    CASE WHEN v_service.pricing_mode = 'by_size' THEN p_pet_size ELSE NULL END,
    v_service_name, v_price_cents, v_duration_minutes, v_notes, v_user_id
  )
  RETURNING id INTO v_appointment_id;

  RETURN v_appointment_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_appointment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_appointment(
  p_appointment_id uuid,
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_timezone text;
  v_existing record;
  v_customer_id uuid;
  v_service record;
  v_employee_id uuid;
  v_price_cents integer;
  v_duration_minutes integer;
  v_service_name text;
  v_scheduled_end timestamptz;
  v_weekday smallint;
  v_wh record;
  v_local_start time;
  v_local_end time;
  v_notes text;
  v_recalc_snapshot boolean;
  v_pet_size_final text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_existing
  FROM public.appointments a
  WHERE a.id = p_appointment_id AND a.company_id = v_company_id AND a.deleted_at IS NULL;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_existing.status NOT IN ('scheduled', 'confirmed') THEN
    RAISE EXCEPTION 'appointment_not_editable' USING ERRCODE = '22023';
  END IF;

  SELECT c.timezone INTO v_timezone FROM public.companies c WHERE c.id = v_company_id;

  IF p_scheduled_start < now() THEN
    RAISE EXCEPTION 'appointment_in_past' USING ERRCODE = '22023';
  END IF;

  SELECT p.customer_id INTO v_customer_id
  FROM public.pets p
  WHERE p.id = p_pet_id AND p.company_id = v_company_id AND p.deleted_at IS NULL;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'pet_unavailable' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id, s.name, s.pricing_mode, s.price_cents, s.duration_minutes
  INTO v_service
  FROM public.services s
  WHERE s.id = p_service_id AND s.company_id = v_company_id
    AND s.deleted_at IS NULL AND s.active = true;

  IF v_service.id IS NULL THEN
    RAISE EXCEPTION 'service_unavailable' USING ERRCODE = 'P0002';
  END IF;

  SELECT e.id INTO v_employee_id
  FROM public.employees e
  WHERE e.id = p_employee_id AND e.company_id = v_company_id
    AND e.deleted_at IS NULL AND e.active = true AND e.can_be_scheduled = true;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_not_eligible' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employee_services es
    WHERE es.employee_id = p_employee_id AND es.service_id = p_service_id
      AND es.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'employee_service_mismatch' USING ERRCODE = '22023';
  END IF;

  v_recalc_snapshot := (
    p_service_id IS DISTINCT FROM v_existing.service_id
    OR (v_service.pricing_mode = 'by_size' AND p_pet_size IS DISTINCT FROM v_existing.pet_size)
  );

  IF v_recalc_snapshot THEN
    v_service_name := v_service.name;
    IF v_service.pricing_mode = 'fixed' THEN
      v_price_cents := v_service.price_cents;
      v_duration_minutes := v_service.duration_minutes;
      v_pet_size_final := NULL;
    ELSE
      IF p_pet_size IS NULL OR p_pet_size NOT IN ('small', 'medium', 'large', 'giant') THEN
        RAISE EXCEPTION 'invalid_pet_size' USING ERRCODE = '22023';
      END IF;
      SELECT sp.price_cents, sp.duration_minutes INTO v_price_cents, v_duration_minutes
      FROM public.service_size_prices sp
      WHERE sp.service_id = p_service_id AND sp.company_id = v_company_id AND sp.size = p_pet_size;
      IF v_price_cents IS NULL THEN
        RAISE EXCEPTION 'invalid_pet_size' USING ERRCODE = '22023';
      END IF;
      v_pet_size_final := p_pet_size;
    END IF;
  ELSE
    v_price_cents := v_existing.price_cents_snapshot;
    v_duration_minutes := v_existing.duration_minutes_snapshot;
    v_service_name := v_existing.service_name_snapshot;
    v_pet_size_final := v_existing.pet_size;
  END IF;

  v_scheduled_end := p_scheduled_start + make_interval(mins => v_duration_minutes);
  v_weekday := EXTRACT(DOW FROM timezone(v_timezone, p_scheduled_start))::smallint;

  SELECT ewh.enabled, ewh.start_time, ewh.end_time INTO v_wh
  FROM public.employee_working_hours ewh
  WHERE ewh.employee_id = p_employee_id AND ewh.company_id = v_company_id AND ewh.weekday = v_weekday;

  IF v_wh IS NULL OR v_wh.enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'outside_working_hours' USING ERRCODE = '22023';
  END IF;

  v_local_start := (timezone(v_timezone, p_scheduled_start))::time;
  v_local_end := (timezone(v_timezone, v_scheduled_end))::time;

  IF v_local_start < v_wh.start_time OR v_local_end > v_wh.end_time THEN
    RAISE EXCEPTION 'outside_working_hours' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.company_id = v_company_id AND a.employee_id = p_employee_id
      AND a.id <> p_appointment_id
      AND a.deleted_at IS NULL AND a.status IN ('scheduled', 'confirmed', 'in_progress')
      AND tstzrange(a.scheduled_start, a.scheduled_end, '[)') &&
          tstzrange(p_scheduled_start, v_scheduled_end, '[)')
  ) THEN
    RAISE EXCEPTION 'employee_schedule_conflict' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.company_id = v_company_id AND a.pet_id = p_pet_id
      AND a.id <> p_appointment_id
      AND a.deleted_at IS NULL AND a.status IN ('scheduled', 'confirmed', 'in_progress')
      AND tstzrange(a.scheduled_start, a.scheduled_end, '[)') &&
          tstzrange(p_scheduled_start, v_scheduled_end, '[)')
  ) THEN
    RAISE EXCEPTION 'pet_schedule_conflict' USING ERRCODE = '23505';
  END IF;

  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  UPDATE public.appointments
  SET
    customer_id = v_customer_id,
    pet_id = p_pet_id,
    service_id = p_service_id,
    employee_id = p_employee_id,
    scheduled_start = p_scheduled_start,
    scheduled_end = v_scheduled_end,
    pet_size = v_pet_size_final,
    service_name_snapshot = v_service_name,
    price_cents_snapshot = v_price_cents,
    duration_minutes_snapshot = v_duration_minutes,
    notes = v_notes
  WHERE id = p_appointment_id AND company_id = v_company_id;

  RETURN p_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_appointment(uuid, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_appointment(uuid, uuid, uuid, uuid, timestamptz, text, text) TO authenticated;
