-- PetGestor — Estoque: produtos, categorias, fornecedores, lotes e movimentações
-- MIGRATION PENDENTE — aplicar no SQL Editor do Supabase após as anteriores.

-- ---------------------------------------------------------------------------
-- product_categories
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users (id),
  CONSTRAINT product_categories_name_length CHECK (
    char_length(trim(name)) >= 2 AND char_length(name) <= 80
  ),
  CONSTRAINT product_categories_id_company_id_key UNIQUE (id, company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_company_name_uidx
  ON public.product_categories (company_id, lower(trim(name)))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_categories_company_id
  ON public.product_categories (company_id)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- inventory_suppliers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  document text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users (id),
  CONSTRAINT inventory_suppliers_name_length CHECK (
    char_length(trim(name)) >= 2 AND char_length(name) <= 120
  ),
  CONSTRAINT inventory_suppliers_contact_length CHECK (
    contact_name IS NULL OR char_length(contact_name) <= 120
  ),
  CONSTRAINT inventory_suppliers_notes_length CHECK (
    notes IS NULL OR char_length(notes) <= 2000
  ),
  CONSTRAINT inventory_suppliers_id_company_id_key UNIQUE (id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_suppliers_company_id
  ON public.inventory_suppliers (company_id)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  barcode text,
  category_id uuid,
  description text,
  unit text NOT NULL DEFAULT 'unit',
  cost_price_cents integer NOT NULL DEFAULT 0,
  sale_price_cents integer,
  current_stock numeric(14, 3) NOT NULL DEFAULT 0,
  minimum_stock numeric(14, 3) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  track_stock boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  stock_status text GENERATED ALWAYS AS (
    CASE
      WHEN archived_at IS NOT NULL THEN 'archived'
      WHEN track_stock IS NOT TRUE THEN 'normal'
      WHEN current_stock <= 0 THEN 'out'
      WHEN current_stock <= minimum_stock THEN 'low'
      ELSE 'normal'
    END
  ) STORED,
  CONSTRAINT products_name_length CHECK (
    char_length(trim(name)) >= 2 AND char_length(name) <= 120
  ),
  CONSTRAINT products_sku_length CHECK (sku IS NULL OR char_length(sku) <= 64),
  CONSTRAINT products_barcode_length CHECK (barcode IS NULL OR char_length(barcode) <= 64),
  CONSTRAINT products_description_length CHECK (
    description IS NULL OR char_length(description) <= 2000
  ),
  CONSTRAINT products_unit_check CHECK (
    unit IN ('unit', 'kg', 'g', 'ml', 'l', 'pack', 'box', 'other')
  ),
  CONSTRAINT products_cost_price_check CHECK (
    cost_price_cents >= 0 AND cost_price_cents <= 99999999
  ),
  CONSTRAINT products_sale_price_check CHECK (
    sale_price_cents IS NULL
    OR (sale_price_cents >= 0 AND sale_price_cents <= 99999999)
  ),
  CONSTRAINT products_current_stock_check CHECK (current_stock >= 0),
  CONSTRAINT products_minimum_stock_check CHECK (minimum_stock >= 0),
  CONSTRAINT products_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT products_category_company_fkey
    FOREIGN KEY (category_id, company_id)
    REFERENCES public.product_categories (id, company_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_company_id
  ON public.products (company_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_company_name
  ON public.products (company_id, name)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_company_category
  ON public.products (company_id, category_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_company_stock
  ON public.products (company_id, current_stock)
  WHERE archived_at IS NULL AND track_stock = true;

CREATE INDEX IF NOT EXISTS idx_products_company_stock_status
  ON public.products (company_id, stock_status)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_uidx
  ON public.products (company_id, lower(sku))
  WHERE sku IS NOT NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_company_barcode_uidx
  ON public.products (company_id, barcode)
  WHERE barcode IS NOT NULL AND archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- product_batches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  batch_code text,
  quantity_remaining numeric(14, 3) NOT NULL DEFAULT 0,
  expiration_date date,
  unit_cost_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_batches_quantity_check CHECK (quantity_remaining >= 0),
  CONSTRAINT product_batches_code_length CHECK (
    batch_code IS NULL OR char_length(batch_code) <= 80
  ),
  CONSTRAINT product_batches_cost_check CHECK (
    unit_cost_cents IS NULL
    OR (unit_cost_cents >= 0 AND unit_cost_cents <= 99999999)
  ),
  CONSTRAINT product_batches_product_company_fkey
    FOREIGN KEY (product_id, company_id)
    REFERENCES public.products (id, company_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_batches_product_id
  ON public.product_batches (company_id, product_id);

CREATE INDEX IF NOT EXISTS idx_product_batches_expiration
  ON public.product_batches (company_id, expiration_date)
  WHERE quantity_remaining > 0;

-- ---------------------------------------------------------------------------
-- stock_movements — histórico imutável
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  type text NOT NULL,
  quantity numeric(14, 3) NOT NULL,
  previous_quantity numeric(14, 3) NOT NULL,
  new_quantity numeric(14, 3) NOT NULL,
  unit_cost_cents integer,
  reason text,
  reference_type text,
  reference_id uuid,
  notes text,
  supplier_id uuid,
  batch_id uuid,
  idempotency_key uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_type_check CHECK (
    type IN ('entry', 'exit', 'adjustment', 'loss', 'internal_use', 'return')
  ),
  CONSTRAINT stock_movements_quantity_check CHECK (quantity > 0),
  CONSTRAINT stock_movements_notes_length CHECK (
    notes IS NULL OR char_length(notes) <= 2000
  ),
  CONSTRAINT stock_movements_reason_length CHECK (
    reason IS NULL OR char_length(reason) <= 80
  ),
  CONSTRAINT stock_movements_product_company_fkey
    FOREIGN KEY (product_id, company_id)
    REFERENCES public.products (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT stock_movements_supplier_company_fkey
    FOREIGN KEY (supplier_id, company_id)
    REFERENCES public.inventory_suppliers (id, company_id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idempotency_uidx
  ON public.stock_movements (company_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_stock_movements_company_created
  ON public.stock_movements (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created
  ON public.stock_movements (company_id, product_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- service_product_recipes — preparado para consumo futuro em serviços
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_product_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  service_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(14, 3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_product_recipes_quantity_check CHECK (quantity > 0),
  CONSTRAINT service_product_recipes_service_company_fkey
    FOREIGN KEY (service_id, company_id)
    REFERENCES public.services (id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT service_product_recipes_product_company_fkey
    FOREIGN KEY (product_id, company_id)
    REFERENCES public.products (id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT service_product_recipes_unique UNIQUE (company_id, service_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_service_product_recipes_company
  ON public.service_product_recipes (company_id, service_id);

COMMENT ON TABLE public.service_product_recipes IS
  'Receita futura: serviço consome produto. Sem baixa automática nesta etapa.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS product_categories_set_updated_at ON public.product_categories;
CREATE TRIGGER product_categories_set_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS inventory_suppliers_set_updated_at ON public.inventory_suppliers;
CREATE TRIGGER inventory_suppliers_set_updated_at
  BEFORE UPDATE ON public.inventory_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS product_batches_set_updated_at ON public.product_batches;
CREATE TRIGGER product_batches_set_updated_at
  BEFORE UPDATE ON public.product_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS product_categories_prevent_company_change ON public.product_categories;
CREATE TRIGGER product_categories_prevent_company_change
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS inventory_suppliers_prevent_company_change ON public.inventory_suppliers;
CREATE TRIGGER inventory_suppliers_prevent_company_change
  BEFORE UPDATE ON public.inventory_suppliers
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS products_prevent_company_change ON public.products;
CREATE TRIGGER products_prevent_company_change
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS product_batches_prevent_company_change ON public.product_batches;
CREATE TRIGGER product_batches_prevent_company_change
  BEFORE UPDATE ON public.product_batches
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS stock_movements_prevent_company_change ON public.stock_movements;
CREATE TRIGGER stock_movements_prevent_company_change
  BEFORE UPDATE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

CREATE OR REPLACE FUNCTION private.protect_product_stock_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (
      NEW.current_stock IS DISTINCT FROM OLD.current_stock
      OR NEW.cost_price_cents IS DISTINCT FROM OLD.cost_price_cents
    )
    AND current_setting('petgestor.stock_mutate', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'stock_locked'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_protect_stock_columns ON public.products;
CREATE TRIGGER products_protect_stock_columns
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_product_stock_columns();

CREATE OR REPLACE FUNCTION private.prevent_stock_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements_immutable'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS stock_movements_no_update ON public.stock_movements;
CREATE TRIGGER stock_movements_no_update
  BEFORE UPDATE ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_stock_movement_mutation();

DROP TRIGGER IF EXISTS stock_movements_no_delete ON public.stock_movements;
CREATE TRIGGER stock_movements_no_delete
  BEFORE DELETE ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_stock_movement_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_product_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_categories_select_member ON public.product_categories
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));
CREATE POLICY product_categories_insert_member ON public.product_categories
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND created_by = auth.uid());
CREATE POLICY product_categories_update_member ON public.product_categories
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

CREATE POLICY inventory_suppliers_select_member ON public.inventory_suppliers
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));
CREATE POLICY inventory_suppliers_insert_member ON public.inventory_suppliers
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND created_by = auth.uid());
CREATE POLICY inventory_suppliers_update_member ON public.inventory_suppliers
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

CREATE POLICY products_select_member ON public.products
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));
CREATE POLICY products_insert_member ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND created_by = auth.uid());
CREATE POLICY products_update_member ON public.products
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

CREATE POLICY product_batches_select_member ON public.product_batches
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

CREATE POLICY stock_movements_select_member ON public.stock_movements
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

CREATE POLICY service_product_recipes_select_member ON public.service_product_recipes
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));
CREATE POLICY service_product_recipes_insert_member ON public.service_product_recipes
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id));
CREATE POLICY service_product_recipes_update_member ON public.service_product_recipes
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));
CREATE POLICY service_product_recipes_delete_member ON public.service_product_recipes
  FOR DELETE TO authenticated USING (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- RPC helper: company do usuário
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_stock_movement(
  p_product_id uuid,
  p_type text,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_unit_cost_cents integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_batch_code text DEFAULT NULL,
  p_expiration_date date DEFAULT NULL,
  p_counted_stock numeric DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_product public.products%ROWTYPE;
  v_existing uuid;
  v_qty numeric(14, 3);
  v_delta numeric(14, 3);
  v_previous numeric(14, 3);
  v_new numeric(14, 3);
  v_cost integer;
  v_available numeric(14, 3);
  v_expired numeric(14, 3);
  v_name text;
  v_movement_id uuid;
  v_batch_id uuid;
  v_remaining numeric(14, 3);
  v_take numeric(14, 3);
  v_batch public.product_batches%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT cm.company_id INTO v_company_id
  FROM public.company_members cm
  WHERE cm.user_id = v_user_id
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing
  FROM public.stock_movements
  WHERE company_id = v_company_id
    AND idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF p_type NOT IN ('entry', 'exit', 'adjustment', 'loss', 'internal_use', 'return') THEN
    RAISE EXCEPTION 'invalid_movement_type' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing
  FROM public.stock_movements
  WHERE company_id = v_company_id
    AND idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF v_product.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'archived_product' USING ERRCODE = '22023';
  END IF;

  v_previous := v_product.current_stock;
  v_cost := v_product.cost_price_cents;
  v_qty := round(coalesce(p_quantity, 0), 3);

  IF p_type = 'adjustment' THEN
    IF p_counted_stock IS NULL OR p_counted_stock < 0 THEN
      RAISE EXCEPTION 'invalid_counted_stock' USING ERRCODE = '22023';
    END IF;
    v_new := round(p_counted_stock, 3);
    v_delta := v_new - v_previous;
    IF v_delta = 0 THEN
      RAISE EXCEPTION 'no_stock_change' USING ERRCODE = '22023';
    END IF;
    v_qty := abs(v_delta);
  ELSE
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
    END IF;

    IF p_type IN ('entry', 'return') THEN
      v_delta := v_qty;
      IF p_unit_cost_cents IS NOT NULL THEN
        IF p_unit_cost_cents < 0 OR p_unit_cost_cents > 99999999 THEN
          RAISE EXCEPTION 'invalid_unit_cost' USING ERRCODE = '22023';
        END IF;
        IF v_previous <= 0 THEN
          v_cost := p_unit_cost_cents;
        ELSE
          v_cost := round((v_previous * v_product.cost_price_cents + v_qty * p_unit_cost_cents) / (v_previous + v_qty));
        END IF;
      END IF;
    ELSE
      SELECT coalesce(sum(quantity_remaining), 0) INTO v_expired
      FROM public.product_batches
      WHERE company_id = v_company_id
        AND product_id = v_product.id
        AND quantity_remaining > 0
        AND expiration_date IS NOT NULL
        AND expiration_date < CURRENT_DATE;

      v_available := CASE
        WHEN p_reason = 'expired' OR p_type = 'loss' THEN v_previous
        ELSE GREATEST(0, v_previous - v_expired)
      END;

      IF v_qty > v_available THEN
        RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '22023';
      END IF;

      v_delta := -v_qty;
    END IF;

    v_new := round(v_previous + v_delta, 3);
  END IF;

  IF v_new < 0 THEN
    RAISE EXCEPTION 'negative_stock' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(nullif(trim(full_name), ''), 'Usuário') INTO v_name
  FROM public.profiles
  WHERE id = v_user_id;

  PERFORM set_config('petgestor.stock_mutate', 'on', true);

  UPDATE public.products
  SET current_stock = v_new,
      cost_price_cents = v_cost
  WHERE id = v_product.id
    AND company_id = v_company_id;

  IF p_type IN ('entry', 'return') AND (p_batch_code IS NOT NULL OR p_expiration_date IS NOT NULL) THEN
    SELECT id INTO v_batch_id
    FROM public.product_batches
    WHERE company_id = v_company_id
      AND product_id = v_product.id
      AND coalesce(batch_code, '') = coalesce(nullif(trim(p_batch_code), ''), '')
      AND expiration_date IS NOT DISTINCT FROM p_expiration_date
    FOR UPDATE;

    IF v_batch_id IS NULL THEN
      INSERT INTO public.product_batches (
        company_id, product_id, batch_code, quantity_remaining, expiration_date, unit_cost_cents
      ) VALUES (
        v_company_id,
        v_product.id,
        nullif(trim(coalesce(p_batch_code, '')), ''),
        v_qty,
        p_expiration_date,
        p_unit_cost_cents
      )
      RETURNING id INTO v_batch_id;
    ELSE
      UPDATE public.product_batches
      SET quantity_remaining = quantity_remaining + v_qty
      WHERE id = v_batch_id;
    END IF;
  END IF;

  IF (p_type NOT IN ('entry', 'return', 'adjustment'))
     OR (p_type = 'adjustment' AND v_delta < 0) THEN
    v_remaining := v_qty;
    FOR v_batch IN
      SELECT *
      FROM public.product_batches
      WHERE company_id = v_company_id
        AND product_id = v_product.id
        AND quantity_remaining > 0
        AND (
          p_reason = 'expired'
          OR p_type = 'loss'
          OR p_type = 'adjustment'
          OR expiration_date IS NULL
          OR expiration_date >= CURRENT_DATE
        )
      ORDER BY expiration_date ASC NULLS LAST
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_batch.quantity_remaining, v_remaining);
      UPDATE public.product_batches
      SET quantity_remaining = quantity_remaining - v_take
      WHERE id = v_batch.id;
      v_remaining := v_remaining - v_take;
    END LOOP;
  END IF;

  INSERT INTO public.stock_movements (
    company_id,
    product_id,
    type,
    quantity,
    previous_quantity,
    new_quantity,
    unit_cost_cents,
    reason,
    reference_type,
    reference_id,
    notes,
    supplier_id,
    batch_id,
    idempotency_key,
    created_by,
    created_by_name
  ) VALUES (
    v_company_id,
    v_product.id,
    p_type,
    v_qty,
    v_previous,
    v_new,
    coalesce(p_unit_cost_cents, v_product.cost_price_cents),
    nullif(trim(coalesce(p_reason, '')), ''),
    nullif(trim(coalesce(p_reference_type, '')), ''),
    p_reference_id,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_supplier_id,
    v_batch_id,
    p_idempotency_key,
    v_user_id,
    coalesce(v_name, 'Usuário')
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing
    FROM public.stock_movements
    WHERE company_id = v_company_id
      AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.register_stock_movement(
  uuid, text, numeric, uuid, integer, text, text, uuid, text, date, numeric, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_stock_movement(
  uuid, text, numeric, uuid, integer, text, text, uuid, text, date, numeric, text, uuid
) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.product_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inventory_suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.products TO authenticated;
GRANT SELECT ON public.product_batches TO authenticated;
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_product_recipes TO authenticated;
