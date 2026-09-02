-- PetGestor — usar pacote vendido no agendamento
-- Permite vincular customer_service_packages na criação do appointment,
-- consumir uma sessão de forma idempotente e reverter no cancelamento.

-- ---------------------------------------------------------------------------
-- appointments.customer_package_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS customer_package_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_customer_package_company_fkey'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_customer_package_company_fkey
      FOREIGN KEY (customer_package_id, company_id)
      REFERENCES public.customer_service_packages (id, company_id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_appointments_customer_package
  ON public.appointments (company_id, customer_package_id)
  WHERE customer_package_id IS NOT NULL
    AND deleted_at IS NULL;

-- Consumo no agendamento acontece antes do check-in (ainda sem OS).
ALTER TABLE public.customer_service_package_usages
  ALTER COLUMN service_order_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_service_package_usages_appointment_consumed_uidx
  ON public.customer_service_package_usages (company_id, appointment_id)
  WHERE status = 'consumed';

-- ---------------------------------------------------------------------------
-- Helper: consumir (ou reutilizar) sessão para um agendamento
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.consume_package_for_appointment(
  p_company_id uuid,
  p_appointment_id uuid,
  p_customer_package_id uuid,
  p_service_order_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_timezone text;
  v_today date;
  v_appointment record;
  v_pkg record;
  v_balance record;
  v_usage record;
  v_usage_id uuid;
  v_original_price integer;
BEGIN
  IF p_customer_package_id IS NULL THEN
    RAISE EXCEPTION 'customer_package_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.timezone INTO v_timezone FROM public.companies c WHERE c.id = p_company_id;
  v_today := (timezone(COALESCE(v_timezone, 'America/Sao_Paulo'), now()))::date;

  SELECT u.id, u.customer_package_id, u.service_order_id
  INTO v_usage
  FROM public.customer_service_package_usages u
  WHERE u.appointment_id = p_appointment_id
    AND u.company_id = p_company_id
    AND u.status = 'consumed'
  FOR UPDATE;

  IF v_usage.id IS NOT NULL THEN
    IF v_usage.customer_package_id IS DISTINCT FROM p_customer_package_id THEN
      RAISE EXCEPTION 'package_already_consumed' USING ERRCODE = '22023';
    END IF;

    IF p_service_order_id IS NOT NULL THEN
      IF v_usage.service_order_id IS NULL THEN
        UPDATE public.customer_service_package_usages
        SET service_order_id = p_service_order_id
        WHERE id = v_usage.id AND company_id = p_company_id;
      ELSIF v_usage.service_order_id IS DISTINCT FROM p_service_order_id THEN
        RAISE EXCEPTION 'package_already_consumed' USING ERRCODE = '22023';
      END IF;
    END IF;

    UPDATE public.appointments
    SET
      price_cents_snapshot = 0,
      customer_package_id = p_customer_package_id
    WHERE id = p_appointment_id AND company_id = p_company_id;

    RETURN v_usage.id;
  END IF;

  SELECT a.id, a.pet_id, a.service_id, a.price_cents_snapshot, a.customer_package_id
  INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.company_id = p_company_id
    AND a.deleted_at IS NULL
  FOR UPDATE;

  IF v_appointment.id IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_appointment.price_cents_snapshot = 0 THEN
    RAISE EXCEPTION 'appointment_already_covered' USING ERRCODE = '22023';
  END IF;

  SELECT csp.id, csp.status, csp.expires_at, csp.starts_at, csp.pet_id
  INTO v_pkg
  FROM public.customer_service_packages csp
  WHERE csp.id = p_customer_package_id
    AND csp.company_id = p_company_id
  FOR UPDATE;

  IF v_pkg.id IS NULL THEN
    RAISE EXCEPTION 'customer_package_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_pkg.pet_id <> v_appointment.pet_id THEN
    RAISE EXCEPTION 'package_pet_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_pkg.status <> 'active' THEN
    RAISE EXCEPTION 'package_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_pkg.starts_at > v_today THEN
    RAISE EXCEPTION 'package_not_started' USING ERRCODE = '22023';
  END IF;

  IF v_pkg.expires_at < v_today THEN
    PERFORM private.refresh_customer_service_package_status(p_customer_package_id, p_company_id);
    RAISE EXCEPTION 'package_expired' USING ERRCODE = '22023';
  END IF;

  SELECT cspi.id, cspi.quantity_total, cspi.quantity_used
  INTO v_balance
  FROM public.customer_service_package_items cspi
  WHERE cspi.customer_package_id = p_customer_package_id
    AND cspi.company_id = p_company_id
    AND cspi.service_id = v_appointment.service_id
    AND cspi.quantity_used < cspi.quantity_total
  FOR UPDATE;

  IF v_balance.id IS NULL THEN
    RAISE EXCEPTION 'package_balance_unavailable' USING ERRCODE = '22023';
  END IF;

  v_original_price := v_appointment.price_cents_snapshot;

  UPDATE public.customer_service_package_items
  SET quantity_used = quantity_used + 1
  WHERE id = v_balance.id AND company_id = p_company_id;

  UPDATE public.appointments
  SET
    price_cents_snapshot = 0,
    customer_package_id = p_customer_package_id
  WHERE id = v_appointment.id AND company_id = p_company_id;

  INSERT INTO public.customer_service_package_usages (
    company_id,
    customer_package_id,
    customer_package_item_id,
    service_id,
    appointment_id,
    service_order_id,
    quantity,
    status,
    original_price_cents_snapshot
  ) VALUES (
    p_company_id,
    p_customer_package_id,
    v_balance.id,
    v_appointment.service_id,
    v_appointment.id,
    p_service_order_id,
    1,
    'consumed',
    v_original_price
  )
  RETURNING id INTO v_usage_id;

  PERFORM private.refresh_customer_service_package_status(p_customer_package_id, p_company_id);

  RETURN v_usage_id;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_package_for_appointment(uuid, uuid, uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Helper: estornar consumo do agendamento (no-op se não houver)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.reverse_package_usage_for_appointment(
  p_company_id uuid,
  p_appointment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_usage record;
BEGIN
  SELECT u.id, u.customer_package_id, u.customer_package_item_id,
         u.original_price_cents_snapshot
  INTO v_usage
  FROM public.customer_service_package_usages u
  WHERE u.appointment_id = p_appointment_id
    AND u.company_id = p_company_id
    AND u.status = 'consumed'
  FOR UPDATE;

  IF v_usage.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.customer_service_package_items
  SET quantity_used = quantity_used - 1
  WHERE id = v_usage.customer_package_item_id
    AND company_id = p_company_id
    AND quantity_used > 0;

  UPDATE public.appointments
  SET price_cents_snapshot = v_usage.original_price_cents_snapshot
  WHERE id = p_appointment_id AND company_id = p_company_id;

  UPDATE public.customer_service_package_usages
  SET status = 'reversed', reversed_at = now()
  WHERE id = v_usage.id AND company_id = p_company_id;

  PERFORM private.refresh_customer_service_package_status(v_usage.customer_package_id, p_company_id);

  RETURN v_usage.id;
END;
$$;

REVOKE ALL ON FUNCTION private.reverse_package_usage_for_appointment(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- consume_customer_service_package: reutiliza helper (idempotente por appointment)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_customer_service_package(
  p_service_order_id uuid,
  p_customer_package_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_order record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT so.id, so.status, so.appointment_id
  INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status NOT IN ('waiting', 'in_progress') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  RETURN private.consume_package_for_appointment(
    v_company_id,
    v_order.appointment_id,
    p_customer_package_id,
    p_service_order_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- create_appointment: parâmetro opcional de pacote vendido
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_appointment(uuid, uuid, uuid, timestamptz, text, text);

CREATE FUNCTION public.create_appointment(
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

-- ---------------------------------------------------------------------------
-- update_appointment: reagendar sem consumir nova sessão
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_appointment(uuid, uuid, uuid, uuid, timestamptz, text, text);

CREATE FUNCTION public.update_appointment(
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

REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, uuid, timestamptz, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_appointment(uuid, uuid, uuid, uuid, timestamptz, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, uuid, timestamptz, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_appointment(uuid, uuid, uuid, uuid, timestamptz, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- check_in: amarrar OS ao consumo já feito no agendamento
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_in_appointment(
  p_appointment_id uuid,
  p_intake_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_appointment record;
  v_existing_id uuid;
  v_service_order_id uuid;
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

  SELECT so.id INTO v_existing_id
  FROM public.service_orders so
  WHERE so.appointment_id = p_appointment_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL;

  IF v_existing_id IS NOT NULL THEN
    PERFORM private.seed_service_order_consumptions(v_company_id, v_existing_id, v_user_id);
    UPDATE public.customer_service_package_usages
    SET service_order_id = v_existing_id
    WHERE company_id = v_company_id
      AND appointment_id = p_appointment_id
      AND status = 'consumed'
      AND service_order_id IS NULL;
    RETURN v_existing_id;
  END IF;

  SELECT a.id, a.status INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.company_id = v_company_id
    AND a.deleted_at IS NULL;

  IF v_appointment.id IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_appointment.status IN ('cancelled', 'no_show', 'completed') THEN
    RAISE EXCEPTION 'appointment_not_eligible' USING ERRCODE = '22023';
  END IF;

  IF v_appointment.status = 'scheduled' THEN
    UPDATE public.appointments
    SET status = 'confirmed'
    WHERE id = p_appointment_id AND company_id = v_company_id;
  END IF;

  v_notes := nullif(trim(coalesce(p_intake_notes, '')), '');

  INSERT INTO public.service_orders (
    company_id, appointment_id, status, intake_notes, created_by
  ) VALUES (
    v_company_id, p_appointment_id, 'waiting', v_notes, v_user_id
  )
  RETURNING id INTO v_service_order_id;

  PERFORM private.seed_service_order_consumptions(v_company_id, v_service_order_id, v_user_id);

  UPDATE public.customer_service_package_usages
  SET service_order_id = v_service_order_id
  WHERE company_id = v_company_id
    AND appointment_id = p_appointment_id
    AND status = 'consumed'
    AND service_order_id IS NULL;

  RETURN v_service_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Cancelamento de agendamento devolve a sessão
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.reverse_package_on_appointment_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM private.reverse_package_usage_for_appointment(NEW.company_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reverse_package_on_appointment_cancel() FROM PUBLIC;

DROP TRIGGER IF EXISTS appointments_reverse_package_on_cancel ON public.appointments;
CREATE TRIGGER appointments_reverse_package_on_cancel
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION private.reverse_package_on_appointment_cancel();

COMMENT ON COLUMN public.appointments.customer_package_id IS
  'Pacote vendido vinculado ao agendamento (customer_service_packages).';
