-- PetGestor BLOCO 3 — check-in, OS, máquina de estados e concorrência
-- Incremental. Não edita BLOCO 1 nem BLOCO 2.
-- Não reseta dados. Não desliga RLS.

-- ---------------------------------------------------------------------------
-- 1. cancelled_at (instante UTC). Não sobrescrito em retry.
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

COMMENT ON COLUMN public.service_orders.cancelled_at IS
  'Instante UTC em que a OS foi cancelada. Preenchido uma vez; retry não sobrescreve.';

-- ---------------------------------------------------------------------------
-- 2. Máquina de estados central (espelha src/features/service-orders/status.ts)
--    waiting → in_progress | cancelled
--    in_progress → ready
--    ready → completed
--    completed / cancelled → terminais
--    Cancelar in_progress/ready NÃO é permitido (regra atual do produto).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.service_order_transition_allowed(
  p_from text,
  p_to text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_from
    WHEN 'waiting' THEN p_to IN ('in_progress', 'cancelled')
    WHEN 'in_progress' THEN p_to = 'ready'
    WHEN 'ready' THEN p_to = 'completed'
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION private.service_order_transition_allowed(text, text) FROM PUBLIC;

COMMENT ON FUNCTION private.service_order_transition_allowed(text, text) IS
  'Transições permitidas da OS. Mesmo status é idempotência, não transição.';

CREATE OR REPLACE FUNCTION private.service_order_mutation_result(
  p_id uuid,
  p_status text,
  p_changed boolean,
  p_idempotent boolean,
  p_created boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_id,
    'status', p_status,
    'changed', p_changed,
    'idempotent', p_idempotent,
    'created', p_created
  );
$$;

REVOKE ALL ON FUNCTION private.service_order_mutation_result(uuid, text, boolean, boolean, boolean)
  FROM PUBLIC;

-- Signatures públicas/privadas passam a jsonb {id,status,changed,idempotent,created}.
DROP FUNCTION IF EXISTS public.check_in_appointment(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.start_service_order(uuid, uuid);
DROP FUNCTION IF EXISTS public.mark_service_order_ready(uuid, uuid);
DROP FUNCTION IF EXISTS public.complete_service_order(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.cancel_service_order(uuid, uuid);

DROP FUNCTION IF EXISTS private.check_in_appointment(uuid, text);
DROP FUNCTION IF EXISTS private.start_service_order(uuid);
DROP FUNCTION IF EXISTS private.mark_service_order_ready(uuid);
DROP FUNCTION IF EXISTS private.complete_service_order(uuid, text);
DROP FUNCTION IF EXISTS private.cancel_service_order(uuid);

-- ---------------------------------------------------------------------------
-- 3. Seed de consumos: lock da OS + ON CONFLICT (sem duplicar em concorrência)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.seed_service_order_consumptions(
  p_company_id uuid,
  p_service_order_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_service_id uuid;
  v_order_id uuid;
BEGIN
  SELECT so.id INTO v_order_id
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = p_company_id
    AND so.deleted_at IS NULL
  FOR UPDATE;

  IF v_order_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.service_order_consumptions
    WHERE company_id = p_company_id
      AND service_order_id = p_service_order_id
  ) THEN
    RETURN;
  END IF;

  SELECT a.service_id INTO v_service_id
  FROM public.service_orders so
  JOIN public.appointments a
    ON a.id = so.appointment_id AND a.company_id = so.company_id
  WHERE so.id = p_service_order_id AND so.company_id = p_company_id;

  IF v_service_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.service_order_consumptions (
    company_id, service_order_id, product_id, product_name_snapshot,
    unit, quantity, unit_cost_cents_snapshot, source, created_by
  )
  SELECT
    p_company_id,
    p_service_order_id,
    r.product_id,
    left(p.name, 120),
    p.unit,
    r.quantity,
    p.cost_price_cents,
    'recipe',
    p_user_id
  FROM public.service_product_recipes r
  JOIN public.products p
    ON p.id = r.product_id AND p.company_id = r.company_id
  WHERE r.company_id = p_company_id
    AND r.service_id = v_service_id
    AND p.archived_at IS NULL
    AND p.active = true
  ON CONFLICT (company_id, service_order_id, product_id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. check_in_appointment — lock do appointment + INSERT ON CONFLICT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.check_in_appointment(
  p_appointment_id uuid,
  p_intake_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_appointment record;
  v_existing record;
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

  -- Serializa check-ins do mesmo agendamento (equivalente a duas abas).
  SELECT a.id, a.status, a.deleted_at, a.company_id
  INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.company_id = v_company_id
  FOR UPDATE;

  IF v_appointment.id IS NULL OR v_appointment.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT so.id, so.status, so.deleted_at
  INTO v_existing
  FROM public.service_orders so
  WHERE so.appointment_id = p_appointment_id
    AND so.company_id = v_company_id
  FOR UPDATE;

  IF v_existing.id IS NOT NULL AND v_existing.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'appointment_not_eligible' USING ERRCODE = '22023';
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.deleted_at IS NULL THEN
    IF v_existing.status = 'cancelled' THEN
      RAISE EXCEPTION 'service_order_cancelled' USING ERRCODE = '22023';
    END IF;

    IF v_existing.status = 'completed' THEN
      RAISE EXCEPTION 'appointment_not_eligible' USING ERRCODE = '22023';
    END IF;

    -- Retry / segunda aba: mesma OS operacional. Sem efeitos extras.
    PERFORM private.seed_service_order_consumptions(v_company_id, v_existing.id, v_user_id);

    UPDATE public.customer_service_package_usages
    SET service_order_id = v_existing.id
    WHERE company_id = v_company_id
      AND appointment_id = p_appointment_id
      AND status = 'consumed'
      AND service_order_id IS NULL;

    RETURN private.service_order_mutation_result(v_existing.id, v_existing.status, false, true, false);
  END IF;

  IF v_appointment.status IN ('cancelled', 'no_show', 'completed') THEN
    RAISE EXCEPTION 'appointment_not_eligible' USING ERRCODE = '22023';
  END IF;

  v_notes := nullif(trim(coalesce(p_intake_notes, '')), '');

  BEGIN
    INSERT INTO public.service_orders (
      company_id, appointment_id, status, intake_notes, created_by, check_in_at
    ) VALUES (
      v_company_id, p_appointment_id, 'waiting', v_notes, v_user_id, now()
    )
    ON CONFLICT (appointment_id) DO NOTHING
    RETURNING id INTO v_service_order_id;
  EXCEPTION
    WHEN unique_violation THEN
      v_service_order_id := NULL;
  END;

  IF v_service_order_id IS NULL THEN
    SELECT so.id, so.status, so.deleted_at
    INTO v_existing
    FROM public.service_orders so
    WHERE so.appointment_id = p_appointment_id
      AND so.company_id = v_company_id
    FOR UPDATE;

    IF v_existing.id IS NULL OR v_existing.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_existing.status = 'cancelled' THEN
      RAISE EXCEPTION 'service_order_cancelled' USING ERRCODE = '22023';
    END IF;

    IF v_existing.status = 'completed' THEN
      RAISE EXCEPTION 'appointment_not_eligible' USING ERRCODE = '22023';
    END IF;

    PERFORM private.seed_service_order_consumptions(v_company_id, v_existing.id, v_user_id);

    UPDATE public.customer_service_package_usages
    SET service_order_id = v_existing.id
    WHERE company_id = v_company_id
      AND appointment_id = p_appointment_id
      AND status = 'consumed'
      AND service_order_id IS NULL;

    RETURN private.service_order_mutation_result(v_existing.id, v_existing.status, false, true, false);
  END IF;

  UPDATE public.appointments
  SET status = 'confirmed'
  WHERE id = p_appointment_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
    AND status = 'scheduled';

  PERFORM private.seed_service_order_consumptions(v_company_id, v_service_order_id, v_user_id);

  UPDATE public.customer_service_package_usages
  SET service_order_id = v_service_order_id
  WHERE company_id = v_company_id
    AND appointment_id = p_appointment_id
    AND status = 'consumed'
    AND service_order_id IS NULL;

  RETURN private.service_order_mutation_result(v_service_order_id, 'waiting', true, false, true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. start_service_order — CAS waiting → in_progress (retry idempotente)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.start_service_order(
  p_service_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_order record;
  v_updated uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT so.id, so.status, so.appointment_id, so.started_at
  INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status = 'in_progress' THEN
    RETURN private.service_order_mutation_result(p_service_order_id, 'in_progress', false, true, false);
  END IF;

  IF NOT private.service_order_transition_allowed(v_order.status, 'in_progress') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_orders
  SET
    status = 'in_progress',
    started_at = COALESCE(started_at, now())
  WHERE id = p_service_order_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
    AND status = 'waiting'
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointments
  SET status = 'in_progress'
  WHERE id = v_order.appointment_id
    AND company_id = v_company_id
    AND status IN ('scheduled', 'confirmed', 'in_progress');

  RETURN private.service_order_mutation_result(p_service_order_id, 'in_progress', true, false, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. mark_service_order_ready — lock + CAS; estoque/receita só se mudou
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.mark_service_order_ready(
  p_service_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_order record;
  v_appointment record;
  v_description text;
  v_due_date date;
  v_line record;
  v_product record;
  v_movement_id uuid;
  v_movement_key uuid;
  v_notes text;
  v_available numeric(14, 3);
  v_expired numeric(14, 3);
  v_updated uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT so.id, so.status, so.appointment_id, so.ready_at
  INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Retry da mesma ação: já pronto, sem repetir estoque/receita.
  IF v_order.status = 'ready' THEN
    RETURN private.service_order_mutation_result(p_service_order_id, 'ready', false, true, false);
  END IF;

  IF NOT private.service_order_transition_allowed(v_order.status, 'ready') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  PERFORM private.seed_service_order_consumptions(v_company_id, p_service_order_id, v_user_id);

  SELECT
    a.price_cents_snapshot,
    a.service_name_snapshot,
    p.name AS pet_name
  INTO v_appointment
  FROM public.appointments a
  INNER JOIN public.pets p
    ON p.id = a.pet_id AND p.company_id = a.company_id
  WHERE a.id = v_order.appointment_id
    AND a.company_id = v_company_id;

  IF v_appointment.price_cents_snapshot IS NULL THEN
    RAISE EXCEPTION 'appointment_price_unavailable' USING ERRCODE = '22023';
  END IF;

  v_notes := left(
    coalesce(v_appointment.pet_name, 'Pet') || ' — ' || coalesce(v_appointment.service_name_snapshot, 'Serviço'),
    200
  );

  FOR v_line IN
    SELECT *
    FROM public.service_order_consumptions
    WHERE company_id = v_company_id
      AND service_order_id = p_service_order_id
      AND consumed_at IS NULL
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_line.product_id AND company_id = v_company_id
    FOR UPDATE;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'product_not_found' USING ERRCODE = '22023';
    END IF;

    IF v_product.track_stock THEN
      SELECT coalesce(sum(quantity_remaining), 0) INTO v_expired
      FROM public.product_batches
      WHERE company_id = v_company_id
        AND product_id = v_product.id
        AND quantity_remaining > 0
        AND expiration_date IS NOT NULL
        AND expiration_date < CURRENT_DATE;

      v_available := greatest(0, v_product.current_stock - v_expired);

      IF v_line.quantity > v_available THEN
        RAISE EXCEPTION
          'insufficient_stock|%|%|%',
          v_line.product_name_snapshot,
          v_line.quantity::text,
          v_available::text
          USING ERRCODE = '22023';
      END IF;

      v_movement_key := private.stock_movement_key_for_service_order(
        p_service_order_id,
        v_line.id
      );

      v_movement_id := private.register_stock_movement(
        v_line.product_id,
        'internal_use',
        v_line.quantity,
        v_movement_key,
        v_product.cost_price_cents,
        'service_consumption',
        v_notes,
        NULL,
        NULL,
        NULL,
        NULL,
        'service_order',
        p_service_order_id
      );
    ELSE
      v_movement_id := NULL;
    END IF;

    UPDATE public.service_order_consumptions
    SET
      consumed_at = COALESCE(consumed_at, now()),
      stock_movement_id = COALESCE(stock_movement_id, v_movement_id),
      unit_cost_cents_snapshot = coalesce(v_product.cost_price_cents, unit_cost_cents_snapshot),
      product_name_snapshot = left(v_product.name, 120),
      unit = v_product.unit
    WHERE id = v_line.id AND company_id = v_company_id AND consumed_at IS NULL;
  END LOOP;

  UPDATE public.service_orders
  SET
    status = 'ready',
    ready_at = COALESCE(ready_at, now())
  WHERE id = p_service_order_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
    AND status = 'in_progress'
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointments
  SET status = 'completed'
  WHERE id = v_order.appointment_id
    AND company_id = v_company_id
    AND status = 'in_progress';

  IF v_appointment.price_cents_snapshot = 0 THEN
    RETURN private.service_order_mutation_result(p_service_order_id, 'ready', true, false, false);
  END IF;

  v_description := left(
    v_appointment.service_name_snapshot || ' · ' || v_appointment.pet_name,
    160
  );
  v_due_date := (timezone(
    (SELECT c.timezone FROM public.companies c WHERE c.id = v_company_id),
    now()
  ))::date;

  BEGIN
    INSERT INTO public.financial_entries (
      company_id,
      entry_type,
      status,
      source_type,
      service_order_id,
      description,
      category,
      amount_cents,
      due_date,
      created_by
    )
    SELECT
      v_company_id,
      'income',
      'pending',
      'service_order',
      p_service_order_id,
      v_description,
      'Serviços',
      v_appointment.price_cents_snapshot,
      v_due_date,
      v_user_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.financial_entries fe
      WHERE fe.company_id = v_company_id
        AND fe.service_order_id = p_service_order_id
        AND fe.source_type = 'service_order'
        AND fe.deleted_at IS NULL
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  RETURN private.service_order_mutation_result(p_service_order_id, 'ready', true, false, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. complete_service_order — CAS ready → completed (retry idempotente)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.complete_service_order(
  p_service_order_id uuid,
  p_completion_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_order record;
  v_notes text;
  v_updated uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT so.id, so.status, so.completed_at
  INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_notes := nullif(trim(coalesce(p_completion_notes, '')), '');

  IF v_order.status = 'completed' THEN
    IF v_notes IS NOT NULL THEN
      UPDATE public.service_orders
      SET completion_notes = COALESCE(completion_notes, v_notes)
      WHERE id = p_service_order_id AND company_id = v_company_id;
    END IF;
    RETURN private.service_order_mutation_result(p_service_order_id, 'completed', false, true, false);
  END IF;

  IF NOT private.service_order_transition_allowed(v_order.status, 'completed') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_orders
  SET
    status = 'completed',
    completed_at = COALESCE(completed_at, now()),
    completion_notes = COALESCE(v_notes, completion_notes)
  WHERE id = p_service_order_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
    AND status = 'ready'
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  RETURN private.service_order_mutation_result(p_service_order_id, 'completed', true, false, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. cancel_service_order — somente waiting; sincroniza appointment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cancel_service_order(
  p_service_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_order record;
  v_updated uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT so.id, so.status, so.appointment_id, so.cancelled_at
  INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN private.service_order_mutation_result(p_service_order_id, 'cancelled', false, true, false);
  END IF;

  IF NOT private.service_order_transition_allowed(v_order.status, 'cancelled') THEN
    RAISE EXCEPTION 'service_order_not_cancellable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_orders
  SET
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, now())
  WHERE id = p_service_order_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
    AND status = 'waiting'
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'service_order_not_cancellable' USING ERRCODE = '22023';
  END IF;

  -- Cancelar a OS cancela o atendimento daquele agendamento (regra explícita).
  UPDATE public.appointments
  SET
    status = 'cancelled',
    cancellation_reason = COALESCE(cancellation_reason, 'Atendimento cancelado')
  WHERE id = v_order.appointment_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
    AND status IN ('scheduled', 'confirmed');

  RETURN private.service_order_mutation_result(p_service_order_id, 'cancelled', true, false, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Agenda cancela/no-show → OS waiting também cancela (coerência)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cancel_waiting_service_order_on_appointment_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'no_show')
     AND OLD.status IS DISTINCT FROM NEW.status
  THEN
    UPDATE public.service_orders
    SET
      status = 'cancelled',
      cancelled_at = COALESCE(cancelled_at, now())
    WHERE company_id = NEW.company_id
      AND appointment_id = NEW.id
      AND deleted_at IS NULL
      AND status = 'waiting';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.cancel_waiting_service_order_on_appointment_terminal() FROM PUBLIC;

DROP TRIGGER IF EXISTS appointments_cancel_waiting_service_order
  ON public.appointments;

CREATE TRIGGER appointments_cancel_waiting_service_order
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION private.cancel_waiting_service_order_on_appointment_terminal();

COMMENT ON FUNCTION private.check_in_appointment(uuid, text) IS
  'Check-in idempotente: lock do appointment + INSERT ON CONFLICT (appointment_id). OS cancelada não é reativada.';

COMMENT ON FUNCTION private.cancel_service_order(uuid) IS
  'Cancela OS waiting e sincroniza appointment para cancelled na mesma transação.';

-- ---------------------------------------------------------------------------
-- 10. Wrappers públicos (tenant explícito + permissão fail-closed do BLOCO 1)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_in_appointment(
  p_appointment_id uuid,
  p_intake_notes text DEFAULT NULL,
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
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.check_in_appointment(p_appointment_id, p_intake_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_appointment(
  p_appointment_id uuid,
  p_intake_notes text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_in_appointment(
  p_appointment_id uuid,
  p_intake_notes text,
  p_company_id uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_service_order(
  p_service_order_id uuid,
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
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.start_service_order(p_service_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.start_service_order(
  p_service_order_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_service_order(
  p_service_order_id uuid,
  p_company_id uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_service_order_ready(
  p_service_order_id uuid,
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
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.mark_service_order_ready(p_service_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_service_order_ready(
  p_service_order_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mark_service_order_ready(
  p_service_order_id uuid,
  p_company_id uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_service_order(
  p_service_order_id uuid,
  p_completion_notes text DEFAULT NULL,
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
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.complete_service_order(p_service_order_id, p_completion_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_service_order(
  p_service_order_id uuid,
  p_completion_notes text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_service_order(
  p_service_order_id uuid,
  p_completion_notes text,
  p_company_id uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_service_order(
  p_service_order_id uuid,
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
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.cancel_service_order(p_service_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_service_order(
  p_service_order_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_service_order(
  p_service_order_id uuid,
  p_company_id uuid
) TO authenticated;

