-- PetGestor — consumo de estoque em atendimentos (insumos de serviço)
-- Não edita migrations antigas. Não altera lógica do PDV.
-- Baixa ocorre em mark_service_order_ready (in_progress → ready).

-- Chave composta para FK multi-tenant (id já é PK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_orders_id_company_key'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_id_company_key UNIQUE (id, company_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- service_order_consumptions — quantidade REAL a consumir / consumida
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_order_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  unit text NOT NULL,
  quantity numeric(14, 3) NOT NULL,
  unit_cost_cents_snapshot integer,
  source text NOT NULL DEFAULT 'manual',
  stock_movement_id uuid,
  consumed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_order_consumptions_quantity_check CHECK (quantity > 0),
  CONSTRAINT service_order_consumptions_unit_check CHECK (
    unit IN ('unit', 'kg', 'g', 'ml', 'l', 'pack', 'box', 'other')
  ),
  CONSTRAINT service_order_consumptions_source_check CHECK (
    source IN ('recipe', 'manual')
  ),
  CONSTRAINT service_order_consumptions_name_length CHECK (
    char_length(product_name_snapshot) >= 1
    AND char_length(product_name_snapshot) <= 120
  ),
  CONSTRAINT service_order_consumptions_cost_check CHECK (
    unit_cost_cents_snapshot IS NULL OR unit_cost_cents_snapshot >= 0
  ),
  CONSTRAINT service_order_consumptions_so_company_fkey
    FOREIGN KEY (service_order_id, company_id)
    REFERENCES public.service_orders (id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT service_order_consumptions_product_company_fkey
    FOREIGN KEY (product_id, company_id)
    REFERENCES public.products (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT service_order_consumptions_unique_product
    UNIQUE (company_id, service_order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_so_consumptions_order
  ON public.service_order_consumptions (company_id, service_order_id);

CREATE INDEX IF NOT EXISTS idx_so_consumptions_product
  ON public.service_order_consumptions (company_id, product_id, created_at DESC);

DROP TRIGGER IF EXISTS service_order_consumptions_set_updated_at
  ON public.service_order_consumptions;
CREATE TRIGGER service_order_consumptions_set_updated_at
  BEFORE UPDATE ON public.service_order_consumptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS service_order_consumptions_prevent_company_change
  ON public.service_order_consumptions;
CREATE TRIGGER service_order_consumptions_prevent_company_change
  BEFORE UPDATE ON public.service_order_consumptions
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

ALTER TABLE public.service_order_consumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS so_consumptions_select_member ON public.service_order_consumptions;
CREATE POLICY so_consumptions_select_member
  ON public.service_order_consumptions FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS so_consumptions_insert_member ON public.service_order_consumptions;
CREATE POLICY so_consumptions_insert_member
  ON public.service_order_consumptions FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS so_consumptions_update_member ON public.service_order_consumptions;
CREATE POLICY so_consumptions_update_member
  ON public.service_order_consumptions FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS so_consumptions_delete_member ON public.service_order_consumptions;
CREATE POLICY so_consumptions_delete_member
  ON public.service_order_consumptions FOR DELETE TO authenticated
  USING (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_consumptions TO authenticated;

COMMENT ON TABLE public.service_order_consumptions IS
  'Insumos do atendimento: quantidade real. Baixa via mark_service_order_ready.';

COMMENT ON TABLE public.service_product_recipes IS
  'Receita padrão: serviço consome produto (unidade = unidade do produto). Sem conversão automática.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.stock_movement_key_for_service_order(
  p_service_order_id uuid,
  p_consumption_id uuid
)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT private.deterministic_uuid(
    'so_consume:' || p_service_order_id::text || ':' || p_consumption_id::text
  );
$$;

-- Seed receitas no atendimento (idempotente se já houver linhas)
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
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.service_order_consumptions
    WHERE company_id = p_company_id AND service_order_id = p_service_order_id
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
-- RPC: replace_service_product_recipes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_service_product_recipes(
  p_service_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14, 3);
  v_seen uuid[] := ARRAY[]::uuid[];
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
    SELECT 1 FROM public.services
    WHERE id = p_service_id AND company_id = v_company_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_recipe_items' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_product_id := (v_item->>'product_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_recipe_product' USING ERRCODE = '22023';
    END;

    v_quantity := round(coalesce((v_item->>'quantity')::numeric, 0), 3);
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 999999.999 THEN
      RAISE EXCEPTION 'invalid_recipe_quantity' USING ERRCODE = '22023';
    END IF;

    IF v_product_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'duplicate_recipe_product' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_product_id);

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND company_id = v_company_id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'product_not_found' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.service_product_recipes
  WHERE company_id = v_company_id AND service_id = p_service_id;

  INSERT INTO public.service_product_recipes (company_id, service_id, product_id, quantity)
  SELECT
    v_company_id,
    p_service_id,
    (item->>'product_id')::uuid,
    round((item->>'quantity')::numeric, 3)
  FROM jsonb_array_elements(p_items) AS item;

  RETURN p_service_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_service_product_recipes(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_service_product_recipes(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: seed_service_order_consumptions (público, idempotente)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_service_order_consumptions(
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
  v_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status
  FROM public.service_orders
  WHERE id = p_service_order_id AND company_id = v_company_id AND deleted_at IS NULL;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status NOT IN ('waiting', 'in_progress') THEN
    RETURN p_service_order_id;
  END IF;

  PERFORM private.seed_service_order_consumptions(v_company_id, p_service_order_id, v_user_id);
  RETURN p_service_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_service_order_consumptions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_service_order_consumptions(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: upsert_service_order_consumption
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_service_order_consumption(
  p_service_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_source text DEFAULT 'manual'
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
  v_product record;
  v_qty numeric(14, 3);
  v_id uuid;
  v_source text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT id, status INTO v_order
  FROM public.service_orders
  WHERE id = p_service_order_id AND company_id = v_company_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status NOT IN ('waiting', 'in_progress') THEN
    RAISE EXCEPTION 'service_order_not_editable' USING ERRCODE = '22023';
  END IF;

  v_qty := round(coalesce(p_quantity, 0), 3);
  IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 999999.999 THEN
    RAISE EXCEPTION 'invalid_consumption_quantity' USING ERRCODE = '22023';
  END IF;

  v_source := coalesce(nullif(trim(p_source), ''), 'manual');
  IF v_source NOT IN ('recipe', 'manual') THEN
    v_source := 'manual';
  END IF;

  SELECT id, name, unit, cost_price_cents, archived_at, active
  INTO v_product
  FROM public.products
  WHERE id = p_product_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_product.id IS NULL OR v_product.archived_at IS NOT NULL OR v_product.active IS NOT TRUE THEN
    RAISE EXCEPTION 'product_not_found' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.service_order_consumptions (
    company_id, service_order_id, product_id, product_name_snapshot,
    unit, quantity, unit_cost_cents_snapshot, source, created_by
  ) VALUES (
    v_company_id, p_service_order_id, p_product_id, left(v_product.name, 120),
    v_product.unit, v_qty, v_product.cost_price_cents, v_source, v_user_id
  )
  ON CONFLICT (company_id, service_order_id, product_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    product_name_snapshot = EXCLUDED.product_name_snapshot,
    unit = EXCLUDED.unit,
    unit_cost_cents_snapshot = EXCLUDED.unit_cost_cents_snapshot,
    updated_at = now()
  WHERE public.service_order_consumptions.consumed_at IS NULL
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'consumption_already_applied' USING ERRCODE = '22023';
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_service_order_consumption(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_service_order_consumption(uuid, uuid, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: remove_service_order_consumption
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_service_order_consumption(
  p_consumption_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_row record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT c.id, c.consumed_at, so.status
  INTO v_row
  FROM public.service_order_consumptions c
  JOIN public.service_orders so
    ON so.id = c.service_order_id AND so.company_id = c.company_id
  WHERE c.id = p_consumption_id AND c.company_id = v_company_id
  FOR UPDATE OF c;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'consumption_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'consumption_already_applied' USING ERRCODE = '22023';
  END IF;

  IF v_row.status NOT IN ('waiting', 'in_progress') THEN
    RAISE EXCEPTION 'service_order_not_editable' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.service_order_consumptions
  WHERE id = p_consumption_id AND company_id = v_company_id;

  RETURN p_consumption_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_service_order_consumption(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_service_order_consumption(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- check_in_appointment: seed insumos padrão após criar a OS
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

  RETURN v_service_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- mark_service_order_ready: baixa estoque + finança (inalterado quando preço 0)
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
    AND so.deleted_at IS NULL
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'in_progress' THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '22023';
  END IF;

  -- Garante receitas padrão se ainda não houver linhas
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

  -- Baixa estoque por linha (idempotente via chave determinística)
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

      v_movement_id := public.register_stock_movement(
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
      consumed_at = now(),
      stock_movement_id = v_movement_id,
      unit_cost_cents_snapshot = coalesce(v_product.cost_price_cents, unit_cost_cents_snapshot),
      product_name_snapshot = left(v_product.name, 120),
      unit = v_product.unit
    WHERE id = v_line.id AND company_id = v_company_id;
  END LOOP;

  UPDATE public.service_orders
  SET status = 'ready', ready_at = now()
  WHERE id = p_service_order_id AND company_id = v_company_id;

  UPDATE public.appointments
  SET status = 'completed'
  WHERE id = v_order.appointment_id
    AND company_id = v_company_id
    AND status = 'in_progress';

  IF v_appointment.price_cents_snapshot = 0 THEN
    RETURN p_service_order_id;
  END IF;

  v_description := left(
    v_appointment.service_name_snapshot || ' · ' || v_appointment.pet_name,
    160
  );
  v_due_date := (timezone(
    (SELECT c.timezone FROM public.companies c WHERE c.id = v_company_id),
    now()
  ))::date;

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

  RETURN p_service_order_id;
END;
$$;
