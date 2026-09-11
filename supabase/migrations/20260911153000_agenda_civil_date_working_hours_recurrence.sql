-- PetGestor BLOCO 2 — agenda: intervalo de jornada, recorrência atômica e status concorrente.
-- Incremental e não destrutiva. NÃO reaplica 20260911120000 (BLOCO 1).
-- Preserva p_company_id, membership ativa, permissões e fail-closed.

-- ---------------------------------------------------------------------------
-- 1. Intervalo opcional por funcionário/dia
-- ---------------------------------------------------------------------------

ALTER TABLE public.employee_working_hours
  ADD COLUMN IF NOT EXISTS break_start time,
  ADD COLUMN IF NOT EXISTS break_end time;

ALTER TABLE public.employee_working_hours
  DROP CONSTRAINT IF EXISTS employee_working_hours_break_check;

ALTER TABLE public.employee_working_hours
  ADD CONSTRAINT employee_working_hours_break_check CHECK (
    (break_start IS NULL AND break_end IS NULL)
    OR (
      enabled = true
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND break_start IS NOT NULL
      AND break_end IS NOT NULL
      AND start_time < break_start
      AND break_start < break_end
      AND break_end < end_time
    )
  );

COMMENT ON COLUMN public.employee_working_hours.break_start IS
  'Início do intervalo de almoço (hora civil da empresa). NULL = sem intervalo.';
COMMENT ON COLUMN public.employee_working_hours.break_end IS
  'Fim do intervalo de almoço (hora civil da empresa). NULL = sem intervalo.';

-- ---------------------------------------------------------------------------
-- 2. Idempotência de recorrência
-- ---------------------------------------------------------------------------

ALTER TABLE public.appointment_recurrences
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS skipped_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS appointment_recurrences_company_idempotency_key
  ON public.appointment_recurrences (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Jornada + intervalo (fonte de verdade no banco, timezone da empresa)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.assert_appointment_fits_working_hours(
  p_company_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, private, auth
AS $$
DECLARE
  v_timezone text;
  v_weekday smallint;
  v_wh record;
  v_local_start time;
  v_local_end time;
BEGIN
  SELECT c.timezone INTO v_timezone
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF v_timezone IS NULL OR btrim(v_timezone) = '' THEN
    v_timezone := 'America/Sao_Paulo';
  END IF;

  v_weekday := EXTRACT(DOW FROM timezone(v_timezone, p_scheduled_start))::smallint;
  v_local_start := (timezone(v_timezone, p_scheduled_start))::time;
  v_local_end := (timezone(v_timezone, p_scheduled_end))::time;

  SELECT ewh.enabled, ewh.start_time, ewh.end_time, ewh.break_start, ewh.break_end
  INTO v_wh
  FROM public.employee_working_hours ewh
  WHERE ewh.employee_id = p_employee_id
    AND ewh.company_id = p_company_id
    AND ewh.weekday = v_weekday;

  IF v_wh IS NULL OR v_wh.enabled IS NOT TRUE OR v_wh.start_time IS NULL OR v_wh.end_time IS NULL THEN
    RAISE EXCEPTION 'outside_working_hours' USING ERRCODE = '22023';
  END IF;

  IF (timezone(v_timezone, p_scheduled_end))::date
       IS DISTINCT FROM (timezone(v_timezone, p_scheduled_start))::date THEN
    RAISE EXCEPTION 'outside_working_hours' USING ERRCODE = '22023';
  END IF;

  IF v_local_start < v_wh.start_time OR v_local_end > v_wh.end_time THEN
    RAISE EXCEPTION 'outside_working_hours' USING ERRCODE = '22023';
  END IF;

  IF v_wh.break_start IS NOT NULL AND v_wh.break_end IS NOT NULL THEN
    IF v_local_start < v_wh.break_end AND v_local_end > v_wh.break_start THEN
      RAISE EXCEPTION 'lunch_break_conflict' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_appointment_fits_working_hours(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Validação de item de jornada (incluindo intervalo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.validate_working_hour_item(p_item jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, private
AS $$
DECLARE
  v_weekday smallint;
  v_enabled boolean;
  v_start time;
  v_end time;
  v_break_start time;
  v_break_end time;
BEGIN
  v_weekday := (p_item->>'weekday')::smallint;
  IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
    RAISE EXCEPTION 'invalid_weekday' USING ERRCODE = '22023';
  END IF;

  v_enabled := coalesce((p_item->>'enabled')::boolean, false);
  IF NOT v_enabled THEN
    RETURN;
  END IF;

  IF (p_item->>'start_time') IS NULL OR (p_item->>'end_time') IS NULL THEN
    RAISE EXCEPTION 'missing_working_hours' USING ERRCODE = '22023';
  END IF;

  v_start := (p_item->>'start_time')::time;
  v_end := (p_item->>'end_time')::time;

  IF v_start >= v_end THEN
    RAISE EXCEPTION 'invalid_time_range' USING ERRCODE = '22023';
  END IF;

  IF nullif(p_item->>'break_start', '') IS NULL AND nullif(p_item->>'break_end', '') IS NULL THEN
    RETURN;
  END IF;

  IF nullif(p_item->>'break_start', '') IS NULL OR nullif(p_item->>'break_end', '') IS NULL THEN
    RAISE EXCEPTION 'invalid_break_range' USING ERRCODE = '22023';
  END IF;

  v_break_start := (p_item->>'break_start')::time;
  v_break_end := (p_item->>'break_end')::time;

  IF NOT (v_start < v_break_start AND v_break_start < v_break_end AND v_break_end < v_end) THEN
    RAISE EXCEPTION 'invalid_break_range' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_working_hour_item(jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. create/update appointment: usar helper de jornada
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.create_appointment(
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_customer_package_id uuid DEFAULT NULL
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
  v_customer_id uuid;
  v_service record;
  v_employee_id uuid;
  v_price_cents integer;
  v_duration_minutes integer;
  v_service_name text;
  v_scheduled_end timestamptz;
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

  PERFORM private.assert_appointment_fits_working_hours(
    v_company_id, p_employee_id, p_scheduled_start, v_scheduled_end
  );

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
    notes, created_by, customer_package_id
  ) VALUES (
    v_company_id, v_customer_id, p_pet_id, p_service_id, p_employee_id,
    p_scheduled_start, v_scheduled_end, 'scheduled',
    CASE WHEN v_service.pricing_mode = 'by_size' THEN p_pet_size ELSE NULL END,
    v_service_name, v_price_cents, v_duration_minutes, v_notes, v_user_id,
    NULL
  )
  RETURNING id INTO v_appointment_id;

  IF p_customer_package_id IS NOT NULL THEN
    PERFORM private.consume_package_for_appointment(
      v_company_id,
      v_appointment_id,
      p_customer_package_id,
      NULL
    );
  END IF;

  RETURN v_appointment_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.update_appointment(
  p_appointment_id uuid,
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_customer_package_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_existing record;
  v_customer_id uuid;
  v_service record;
  v_employee_id uuid;
  v_price_cents integer;
  v_duration_minutes integer;
  v_service_name text;
  v_scheduled_end timestamptz;
  v_notes text;
  v_recalc_snapshot boolean;
  v_pet_size_final text;
  v_usage record;
  v_keep_usage boolean := false;
  v_target_package_id uuid;
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

  PERFORM private.assert_appointment_fits_working_hours(
    v_company_id, p_employee_id, p_scheduled_start, v_scheduled_end
  );

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
  v_target_package_id := p_customer_package_id;

  SELECT u.id, u.customer_package_id
  INTO v_usage
  FROM public.customer_service_package_usages u
  WHERE u.appointment_id = p_appointment_id
    AND u.company_id = v_company_id
    AND u.status = 'consumed'
  FOR UPDATE;

  IF v_usage.id IS NOT NULL THEN
    IF v_target_package_id IS NOT DISTINCT FROM v_usage.customer_package_id
      AND p_service_id IS NOT DISTINCT FROM v_existing.service_id
      AND p_pet_id IS NOT DISTINCT FROM v_existing.pet_id
    THEN
      v_keep_usage := true;
      v_price_cents := 0;
    ELSE
      PERFORM private.reverse_package_usage_for_appointment(v_company_id, p_appointment_id);
    END IF;
  END IF;

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
    notes = v_notes,
    customer_package_id = CASE
      WHEN v_keep_usage THEN v_usage.customer_package_id
      ELSE v_target_package_id
    END
  WHERE id = p_appointment_id AND company_id = v_company_id;

  IF NOT v_keep_usage AND v_target_package_id IS NOT NULL THEN
    PERFORM private.consume_package_for_appointment(
      v_company_id,
      p_appointment_id,
      v_target_package_id,
      NULL
    );
  END IF;

  RETURN p_appointment_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Funcionários: persistir intervalo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.create_employee_with_schedule(
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
  v_service_id uuid;
  v_distinct_services integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  v_name := trim(p_name);
  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_job_title := nullif(trim(coalesce(p_job_title, '')), '');
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND (char_length(v_phone) < 10 OR char_length(v_phone) > 11) THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL AND char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  IF v_job_title IS NOT NULL AND char_length(v_job_title) > 80 THEN
    RAISE EXCEPTION 'invalid_job_title' USING ERRCODE = '22023';
  END IF;

  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'invalid_notes' USING ERRCODE = '22023';
  END IF;

  IF p_working_hours IS NULL OR jsonb_typeof(p_working_hours) <> 'array' THEN
    RAISE EXCEPTION 'invalid_working_hours' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    PERFORM private.validate_working_hour_item(v_item);
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
      RAISE EXCEPTION 'invalid_service_ids' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.employees (
    company_id, name, phone, email, job_title, notes, active, can_be_scheduled, created_by
  ) VALUES (
    v_company_id, v_name, v_phone, v_email, v_job_title, v_notes,
    coalesce(p_active, true), coalesce(p_can_be_scheduled, true), v_user_id
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
      company_id, employee_id, weekday, enabled, start_time, end_time, break_start, break_end
    ) VALUES (
      v_company_id,
      v_employee_id,
      (v_item->>'weekday')::smallint,
      coalesce((v_item->>'enabled')::boolean, false),
      CASE WHEN coalesce((v_item->>'enabled')::boolean, false) THEN (v_item->>'start_time')::time ELSE NULL END,
      CASE WHEN coalesce((v_item->>'enabled')::boolean, false) THEN (v_item->>'end_time')::time ELSE NULL END,
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
         AND nullif(v_item->>'break_start', '') IS NOT NULL
        THEN (v_item->>'break_start')::time
        ELSE NULL
      END,
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
         AND nullif(v_item->>'break_end', '') IS NOT NULL
        THEN (v_item->>'break_end')::time
        ELSE NULL
      END
    );
  END LOOP;

  RETURN v_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.update_employee_with_schedule(
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
  v_service_id uuid;
  v_distinct_services integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_employee_id AND e.company_id = v_company_id AND e.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_name := trim(p_name);
  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_job_title := nullif(trim(coalesce(p_job_title, '')), '');
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND (char_length(v_phone) < 10 OR char_length(v_phone) > 11) THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL AND char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  IF v_job_title IS NOT NULL AND char_length(v_job_title) > 80 THEN
    RAISE EXCEPTION 'invalid_job_title' USING ERRCODE = '22023';
  END IF;

  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'invalid_notes' USING ERRCODE = '22023';
  END IF;

  IF p_working_hours IS NULL OR jsonb_typeof(p_working_hours) <> 'array' THEN
    RAISE EXCEPTION 'invalid_working_hours' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    PERFORM private.validate_working_hour_item(v_item);
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
      RAISE EXCEPTION 'invalid_service_ids' USING ERRCODE = '22023';
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
  WHERE employee_id = p_employee_id AND company_id = v_company_id;

  IF p_service_ids IS NOT NULL THEN
    FOREACH v_service_id IN ARRAY p_service_ids
    LOOP
      INSERT INTO public.employee_services (company_id, employee_id, service_id)
      VALUES (v_company_id, p_employee_id, v_service_id);
    END LOOP;
  END IF;

  DELETE FROM public.employee_working_hours
  WHERE employee_id = p_employee_id AND company_id = v_company_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    INSERT INTO public.employee_working_hours (
      company_id, employee_id, weekday, enabled, start_time, end_time, break_start, break_end
    ) VALUES (
      v_company_id,
      p_employee_id,
      (v_item->>'weekday')::smallint,
      coalesce((v_item->>'enabled')::boolean, false),
      CASE WHEN coalesce((v_item->>'enabled')::boolean, false) THEN (v_item->>'start_time')::time ELSE NULL END,
      CASE WHEN coalesce((v_item->>'enabled')::boolean, false) THEN (v_item->>'end_time')::time ELSE NULL END,
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
         AND nullif(v_item->>'break_start', '') IS NOT NULL
        THEN (v_item->>'break_start')::time
        ELSE NULL
      END,
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
         AND nullif(v_item->>'break_end', '') IS NOT NULL
        THEN (v_item->>'break_end')::time
        ELSE NULL
      END
    );
  END LOOP;

  RETURN p_employee_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Recorrência atômica + idempotente
-- Conflitos de horário/jornada pulam a ocorrência (regra já existente).
-- Erro estrutural aborta a transação — nenhum órfão.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.create_appointment_recurrence(
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_starts timestamptz[],
  p_pet_size text,
  p_notes text,
  p_frequency text,
  p_interval_value integer,
  p_ends_at date,
  p_max_occurrences integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_recurrence_id uuid;
  v_start timestamptz;
  v_appointment_id uuid;
  v_created uuid[] := ARRAY[]::uuid[];
  v_skipped integer := 0;
  v_index integer := 0;
  v_msg text;
  v_existing record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  IF p_scheduled_starts IS NULL OR coalesce(array_length(p_scheduled_starts, 1), 0) < 2 THEN
    RAISE EXCEPTION 'recurrence_no_occurrences' USING ERRCODE = 'P0001';
  END IF;

  IF p_frequency IS NULL OR p_frequency NOT IN ('weekly', 'biweekly', 'monthly', 'custom_days') THEN
    RAISE EXCEPTION 'invalid_recurrence_frequency' USING ERRCODE = '22023';
  END IF;

  IF p_interval_value IS NULL OR p_interval_value < 1 OR p_interval_value > 365 THEN
    RAISE EXCEPTION 'invalid_recurrence_interval' USING ERRCODE = '22023';
  END IF;

  SELECT r.id, r.skipped_count, r.source_appointment_id
  INTO v_existing
  FROM public.appointment_recurrences r
  WHERE r.company_id = v_company_id
    AND r.idempotency_key = p_idempotency_key;

  IF v_existing.id IS NOT NULL THEN
    SELECT coalesce(array_agg(a.id ORDER BY a.recurrence_index), ARRAY[]::uuid[])
    INTO v_created
    FROM public.appointments a
    WHERE a.company_id = v_company_id
      AND a.recurrence_id = v_existing.id
      AND a.deleted_at IS NULL;

    RETURN jsonb_build_object(
      'recurrence_id', v_existing.id,
      'appointment_ids', to_jsonb(v_created),
      'created_count', coalesce(array_length(v_created, 1), 0),
      'skipped_count', v_existing.skipped_count,
      'idempotent', true
    );
  END IF;

  BEGIN
    INSERT INTO public.appointment_recurrences (
      company_id, frequency, interval_value, ends_at, max_occurrences,
      created_by, active, idempotency_key, skipped_count
    ) VALUES (
      v_company_id, p_frequency, p_interval_value, p_ends_at, p_max_occurrences,
      v_user_id, true, p_idempotency_key, 0
    )
    RETURNING id INTO v_recurrence_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT r.id, r.skipped_count
      INTO v_existing
      FROM public.appointment_recurrences r
      WHERE r.company_id = v_company_id
        AND r.idempotency_key = p_idempotency_key;

      SELECT coalesce(array_agg(a.id ORDER BY a.recurrence_index), ARRAY[]::uuid[])
      INTO v_created
      FROM public.appointments a
      WHERE a.company_id = v_company_id
        AND a.recurrence_id = v_existing.id
        AND a.deleted_at IS NULL;

      RETURN jsonb_build_object(
        'recurrence_id', v_existing.id,
        'appointment_ids', to_jsonb(v_created),
        'created_count', coalesce(array_length(v_created, 1), 0),
        'skipped_count', v_existing.skipped_count,
        'idempotent', true
      );
  END;

  FOREACH v_start IN ARRAY p_scheduled_starts
  LOOP
    v_index := v_index + 1;
    BEGIN
      v_appointment_id := private.create_appointment(
        p_pet_id,
        p_service_id,
        p_employee_id,
        v_start,
        p_pet_size,
        p_notes,
        NULL
      );

      UPDATE public.appointments
      SET recurrence_id = v_recurrence_id,
          recurrence_index = v_index
      WHERE id = v_appointment_id
        AND company_id = v_company_id;

      v_created := array_append(v_created, v_appointment_id);
    EXCEPTION
      WHEN SQLSTATE '23505' THEN
        v_skipped := v_skipped + 1;
      WHEN SQLSTATE '22023' THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg IN (
          'outside_working_hours',
          'lunch_break_conflict',
          'time_block_conflict',
          'appointment_in_past'
        ) THEN
          v_skipped := v_skipped + 1;
        ELSE
          RAISE;
        END IF;
    END;
  END LOOP;

  IF coalesce(array_length(v_created, 1), 0) = 0 THEN
    RAISE EXCEPTION 'recurrence_no_occurrences' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.appointment_recurrences
  SET source_appointment_id = v_created[1],
      skipped_count = v_skipped
  WHERE id = v_recurrence_id
    AND company_id = v_company_id;

  RETURN jsonb_build_object(
    'recurrence_id', v_recurrence_id,
    'appointment_ids', to_jsonb(v_created),
    'created_count', array_length(v_created, 1),
    'skipped_count', v_skipped,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION private.create_appointment_recurrence(
  uuid, uuid, uuid, timestamptz[], text, text, text, integer, date, integer, uuid
) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 8. Transição de status atômica (UPDATE ... WHERE status esperado)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.transition_appointment_status(
  p_appointment_id uuid,
  p_next_status text,
  p_cancellation_reason text DEFAULT NULL,
  p_series_scope text DEFAULT 'this'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_current record;
  v_reason text;
  v_following_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF p_next_status NOT IN ('confirmed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  SELECT a.id, a.status, a.recurrence_id, a.scheduled_start
  INTO v_current
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.company_id = v_company_id
    AND a.deleted_at IS NULL
  FOR UPDATE;

  IF v_current.id IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current.status = p_next_status THEN
    RETURN jsonb_build_object(
      'id', v_current.id,
      'status', v_current.status,
      'changed', false,
      'idempotent', true,
      'following_updated', 0,
      'following_ids', '[]'::jsonb
    );
  END IF;

  v_reason := nullif(trim(coalesce(p_cancellation_reason, '')), '');

  UPDATE public.appointments
  SET
    status = p_next_status,
    cancellation_reason = CASE
      WHEN p_next_status = 'cancelled' THEN v_reason
      ELSE cancellation_reason
    END
  WHERE id = p_appointment_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
    AND (
      (p_next_status = 'confirmed' AND status = 'scheduled')
      OR (p_next_status IN ('cancelled', 'no_show') AND status IN ('scheduled', 'confirmed'))
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_status_conflict' USING ERRCODE = '40001';
  END IF;

  IF p_next_status = 'cancelled'
     AND p_series_scope = 'this_and_following'
     AND v_current.recurrence_id IS NOT NULL
  THEN
    WITH updated AS (
      UPDATE public.appointments
      SET
        status = 'cancelled',
        cancellation_reason = coalesce(v_reason, 'Cancelado com a série')
      WHERE company_id = v_company_id
        AND recurrence_id = v_current.recurrence_id
        AND scheduled_start > v_current.scheduled_start
        AND status IN ('scheduled', 'confirmed')
        AND deleted_at IS NULL
      RETURNING id
    )
    SELECT coalesce(array_agg(updated.id), ARRAY[]::uuid[])
    INTO v_following_ids
    FROM updated;
  END IF;

  RETURN jsonb_build_object(
    'id', p_appointment_id,
    'status', p_next_status,
    'changed', true,
    'idempotent', false,
    'following_updated', coalesce(array_length(v_following_ids, 1), 0),
    'following_ids', to_jsonb(coalesce(v_following_ids, ARRAY[]::uuid[]))
  );
END;
$$;

REVOKE ALL ON FUNCTION private.transition_appointment_status(uuid, text, text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 9. Wrappers públicos (tenant explícito + permissão fail-closed)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_appointment_recurrence(
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_starts timestamptz[],
  p_pet_size text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_frequency text DEFAULT 'weekly',
  p_interval_value integer DEFAULT 1,
  p_ends_at date DEFAULT NULL,
  p_max_occurrences integer DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'appointments.create');
  RETURN private.create_appointment_recurrence(
    p_pet_id,
    p_service_id,
    p_employee_id,
    p_scheduled_starts,
    p_pet_size,
    p_notes,
    p_frequency,
    p_interval_value,
    p_ends_at,
    p_max_occurrences,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment_recurrence(
  uuid, uuid, uuid, timestamptz[], text, text, text, integer, date, integer, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_appointment_recurrence(
  uuid, uuid, uuid, timestamptz[], text, text, text, integer, date, integer, uuid, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_appointment_status(
  p_appointment_id uuid,
  p_next_status text,
  p_cancellation_reason text DEFAULT NULL,
  p_series_scope text DEFAULT 'this',
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  IF p_next_status = 'cancelled' THEN
    PERFORM private.require_app_permission(p_company_id, 'appointments.cancel');
  ELSE
    PERFORM private.require_app_permission(p_company_id, 'appointments.edit');
  END IF;
  RETURN private.transition_appointment_status(
    p_appointment_id,
    p_next_status,
    p_cancellation_reason,
    p_series_scope
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_appointment_status(uuid, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.transition_appointment_status(uuid, text, text, text, uuid)
  TO authenticated;
