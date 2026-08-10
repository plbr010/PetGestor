-- PetGestor — Etapa 8: ordens de serviço (service_orders)
-- MIGRATION PENDENTE — aplicar manualmente no Supabase SQL Editor

-- ---------------------------------------------------------------------------
-- service_orders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  check_in_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  intake_notes text,
  internal_notes text,
  completion_notes text,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT service_orders_status_check CHECK (
    status IN ('waiting', 'in_progress', 'ready', 'completed', 'cancelled')
  ),
  CONSTRAINT service_orders_appointment_id_key UNIQUE (appointment_id),
  CONSTRAINT service_orders_appointment_company_fkey
    FOREIGN KEY (appointment_id, company_id)
    REFERENCES public.appointments (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT service_orders_intake_notes_length CHECK (
    intake_notes IS NULL OR char_length(intake_notes) <= 3000
  ),
  CONSTRAINT service_orders_internal_notes_length CHECK (
    internal_notes IS NULL OR char_length(internal_notes) <= 5000
  ),
  CONSTRAINT service_orders_completion_notes_length CHECK (
    completion_notes IS NULL OR char_length(completion_notes) <= 3000
  ),
  CONSTRAINT service_orders_started_at_check CHECK (
    started_at IS NULL OR started_at >= check_in_at
  ),
  CONSTRAINT service_orders_ready_at_check CHECK (
    ready_at IS NULL OR (started_at IS NOT NULL AND ready_at >= started_at)
  ),
  CONSTRAINT service_orders_completed_at_check CHECK (
    completed_at IS NULL OR (ready_at IS NOT NULL AND completed_at >= ready_at)
  )
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_service_orders_company_status
  ON public.service_orders (company_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_company_check_in
  ON public.service_orders (company_id, check_in_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_company_created
  ON public.service_orders (company_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_company_appointment
  ON public.service_orders (company_id, appointment_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS service_orders_set_updated_at ON public.service_orders;
CREATE TRIGGER service_orders_set_updated_at
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS service_orders_prevent_company_change ON public.service_orders;
CREATE TRIGGER service_orders_prevent_company_change
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_orders_select ON public.service_orders;
CREATE POLICY service_orders_select ON public.service_orders
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_orders_insert ON public.service_orders;
CREATE POLICY service_orders_insert ON public.service_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS service_orders_update ON public.service_orders;
CREATE POLICY service_orders_update ON public.service_orders
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- RPC: check_in_appointment
-- scheduled → confirmed no check-in; cria service_order waiting.
-- Idempotente: se ordem já existe, retorna id existente.
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

  RETURN v_service_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: start_service_order
-- waiting → in_progress; appointment → in_progress
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_service_order(
  p_service_order_id uuid
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

  SELECT so.id, so.status, so.appointment_id INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'waiting' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_orders
  SET status = 'in_progress', started_at = now()
  WHERE id = p_service_order_id AND company_id = v_company_id;

  UPDATE public.appointments
  SET status = 'in_progress'
  WHERE id = v_order.appointment_id
    AND company_id = v_company_id
    AND status IN ('scheduled', 'confirmed', 'in_progress');

  RETURN p_service_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: mark_service_order_ready
-- in_progress → ready; appointment in_progress → completed (serviço terminou)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_service_order_ready(
  p_service_order_id uuid
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

  SELECT so.id, so.status, so.appointment_id INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'in_progress' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_orders
  SET status = 'ready', ready_at = now()
  WHERE id = p_service_order_id AND company_id = v_company_id;

  UPDATE public.appointments
  SET status = 'completed'
  WHERE id = v_order.appointment_id
    AND company_id = v_company_id
    AND status = 'in_progress';

  RETURN p_service_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: complete_service_order
-- ready → completed (entrega ao tutor)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_service_order(
  p_service_order_id uuid,
  p_completion_notes text DEFAULT NULL
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

  SELECT so.id, so.status INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'ready' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  v_notes := nullif(trim(coalesce(p_completion_notes, '')), '');

  UPDATE public.service_orders
  SET
    status = 'completed',
    completed_at = now(),
    completion_notes = COALESCE(v_notes, completion_notes)
  WHERE id = p_service_order_id AND company_id = v_company_id;

  RETURN p_service_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel_service_order
-- waiting → cancelled apenas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_service_order(
  p_service_order_id uuid
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

  SELECT so.id, so.status INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'waiting' THEN
    RAISE EXCEPTION 'service_order_not_cancellable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_orders
  SET status = 'cancelled'
  WHERE id = p_service_order_id AND company_id = v_company_id;

  RETURN p_service_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_service_order_notes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_service_order_notes(
  p_service_order_id uuid,
  p_intake_notes text DEFAULT NULL,
  p_internal_notes text DEFAULT NULL,
  p_completion_notes text DEFAULT NULL
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

  SELECT so.id, so.status INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.deleted_at IS NULL;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'service_order_not_editable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_orders
  SET
    intake_notes = nullif(trim(coalesce(p_intake_notes, intake_notes, '')), ''),
    internal_notes = nullif(trim(coalesce(p_internal_notes, internal_notes, '')), ''),
    completion_notes = nullif(trim(coalesce(p_completion_notes, completion_notes, '')), '')
  WHERE id = p_service_order_id AND company_id = v_company_id;

  RETURN p_service_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.check_in_appointment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_service_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_service_order_ready(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_service_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_service_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_service_order_notes(uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_in_appointment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_service_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_service_order_ready(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_service_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_service_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_order_notes(uuid, text, text, text) TO authenticated;
