-- PetGestor — lista de espera, bloqueios pontuais e validação em agendamentos

-- ---------------------------------------------------------------------------
-- schedule_time_blocks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schedule_time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  employee_id uuid,
  block_start timestamptz NOT NULL,
  block_end timestamptz NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT schedule_time_blocks_range_check CHECK (block_end > block_start),
  CONSTRAINT schedule_time_blocks_reason_length CHECK (
    char_length(reason) >= 1
    AND char_length(reason) <= 200
  ),
  CONSTRAINT schedule_time_blocks_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees (id, company_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_time_blocks_company_start
  ON public.schedule_time_blocks (company_id, block_start)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_time_blocks_company_employee_start
  ON public.schedule_time_blocks (company_id, employee_id, block_start)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS schedule_time_blocks_set_updated_at ON public.schedule_time_blocks;
CREATE TRIGGER schedule_time_blocks_set_updated_at
  BEFORE UPDATE ON public.schedule_time_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS schedule_time_blocks_prevent_company_change ON public.schedule_time_blocks;
CREATE TRIGGER schedule_time_blocks_prevent_company_change
  BEFORE UPDATE ON public.schedule_time_blocks
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

ALTER TABLE public.schedule_time_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_time_blocks_select_member ON public.schedule_time_blocks;
CREATE POLICY schedule_time_blocks_select_member
  ON public.schedule_time_blocks
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS schedule_time_blocks_insert_member ON public.schedule_time_blocks;
CREATE POLICY schedule_time_blocks_insert_member
  ON public.schedule_time_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS schedule_time_blocks_update_member ON public.schedule_time_blocks;
CREATE POLICY schedule_time_blocks_update_member
  ON public.schedule_time_blocks
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.schedule_time_blocks TO authenticated;

-- ---------------------------------------------------------------------------
-- appointment_waitlist
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.appointment_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  pet_id uuid NOT NULL,
  service_id uuid NOT NULL,
  preferred_employee_id uuid,
  preferred_date date,
  preferred_period text,
  preferred_time_start time,
  preferred_time_end time,
  notes text,
  status text NOT NULL DEFAULT 'waiting',
  appointment_id uuid,
  contacted_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_waitlist_status_check CHECK (
    status IN ('waiting', 'contacted', 'converted', 'cancelled')
  ),
  CONSTRAINT appointment_waitlist_period_check CHECK (
    preferred_period IS NULL
    OR preferred_period IN ('morning', 'afternoon', 'evening', 'any')
  ),
  CONSTRAINT appointment_waitlist_notes_length CHECK (
    notes IS NULL
    OR char_length(notes) <= 2000
  ),
  CONSTRAINT appointment_waitlist_time_range_check CHECK (
    (preferred_time_start IS NULL AND preferred_time_end IS NULL)
    OR (
      preferred_time_start IS NOT NULL
      AND preferred_time_end IS NOT NULL
      AND preferred_time_end > preferred_time_start
    )
  ),
  CONSTRAINT appointment_waitlist_customer_company_fkey
    FOREIGN KEY (customer_id, company_id)
    REFERENCES public.customers (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointment_waitlist_pet_customer_company_fkey
    FOREIGN KEY (pet_id, customer_id, company_id)
    REFERENCES public.pets (id, customer_id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointment_waitlist_service_company_fkey
    FOREIGN KEY (service_id, company_id)
    REFERENCES public.services (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointment_waitlist_employee_company_fkey
    FOREIGN KEY (preferred_employee_id, company_id)
    REFERENCES public.employees (id, company_id)
    ON DELETE SET NULL,
  CONSTRAINT appointment_waitlist_appointment_company_fkey
    FOREIGN KEY (appointment_id, company_id)
    REFERENCES public.appointments (id, company_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_company_status_created
  ON public.appointment_waitlist (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_company_service_status
  ON public.appointment_waitlist (company_id, service_id, status);

DROP TRIGGER IF EXISTS appointment_waitlist_set_updated_at ON public.appointment_waitlist;
CREATE TRIGGER appointment_waitlist_set_updated_at
  BEFORE UPDATE ON public.appointment_waitlist
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS appointment_waitlist_prevent_company_change ON public.appointment_waitlist;
CREATE TRIGGER appointment_waitlist_prevent_company_change
  BEFORE UPDATE ON public.appointment_waitlist
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

ALTER TABLE public.appointment_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_waitlist_select_member ON public.appointment_waitlist;
CREATE POLICY appointment_waitlist_select_member
  ON public.appointment_waitlist
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS appointment_waitlist_insert_member ON public.appointment_waitlist;
CREATE POLICY appointment_waitlist_insert_member
  ON public.appointment_waitlist
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS appointment_waitlist_update_member ON public.appointment_waitlist;
CREATE POLICY appointment_waitlist_update_member
  ON public.appointment_waitlist
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.appointment_waitlist TO authenticated;

-- ---------------------------------------------------------------------------
-- Helper: bloqueio pontual
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.appointment_overlaps_time_block(
  p_company_id uuid,
  p_employee_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedule_time_blocks stb
    WHERE stb.company_id = p_company_id
      AND stb.deleted_at IS NULL
      AND (stb.employee_id IS NULL OR stb.employee_id = p_employee_id)
      AND tstzrange(stb.block_start, stb.block_end, '[)') &&
          tstzrange(p_start, p_end, '[)')
  );
$$;

REVOKE ALL ON FUNCTION private.appointment_overlaps_time_block(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- create_appointment — validar bloqueios
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

  IF private.appointment_overlaps_time_block(
    v_company_id, p_employee_id, p_scheduled_start, v_scheduled_end
  ) THEN
    RAISE EXCEPTION 'time_block_conflict' USING ERRCODE = '22023';
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
-- update_appointment — validar bloqueios
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

  IF private.appointment_overlaps_time_block(
    v_company_id, p_employee_id, p_scheduled_start, v_scheduled_end
  ) THEN
    RAISE EXCEPTION 'time_block_conflict' USING ERRCODE = '22023';
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
