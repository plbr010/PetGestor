-- PetGestor — PDV / vendas de produtos (integração estoque + financeiro)
-- MIGRATION PENDENTE — aplicar após 20260818120000_inventory.sql

-- ---------------------------------------------------------------------------
-- financial_payments (pagamentos divididos / parciais)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.financial_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  financial_entry_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  payment_method text NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  idempotency_key text,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users (id),
  CONSTRAINT financial_payments_amount_check CHECK (
    amount_cents > 0 AND amount_cents <= 99999999
  ),
  CONSTRAINT financial_payments_payment_method_check CHECK (
    payment_method IN ('cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other')
  ),
  CONSTRAINT financial_payments_notes_length CHECK (
    notes IS NULL OR char_length(notes) <= 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_payments_idempotency_unique
  ON public.financial_payments (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_payments_company_entry
  ON public.financial_payments (company_id, financial_entry_id)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_payments_company_paid_at
  ON public.financial_payments (company_id, paid_at)
  WHERE cancelled_at IS NULL;

ALTER TABLE public.financial_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_payments_select ON public.financial_payments;
CREATE POLICY financial_payments_select ON public.financial_payments
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS financial_payments_insert ON public.financial_payments;
CREATE POLICY financial_payments_insert ON public.financial_payments
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS financial_payments_update ON public.financial_payments;
CREATE POLICY financial_payments_update ON public.financial_payments
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.financial_payments TO authenticated;

-- ---------------------------------------------------------------------------
-- financial_entries: partially_paid + sale source
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_entries
  DROP CONSTRAINT IF EXISTS financial_entries_status_check;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT financial_entries_status_check CHECK (
    status IN ('pending', 'partially_paid', 'paid', 'cancelled')
  );

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS sale_id uuid;

ALTER TABLE public.financial_entries
  DROP CONSTRAINT IF EXISTS financial_entries_source_type_check;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT financial_entries_source_type_check CHECK (
    source_type IN ('service_order', 'manual', 'service_package', 'sale')
  );

ALTER TABLE public.financial_entries
  DROP CONSTRAINT IF EXISTS financial_entries_source_service_order_check;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT financial_entries_source_service_order_check CHECK (
    (source_type = 'service_order' AND service_order_id IS NOT NULL AND customer_service_package_id IS NULL AND sale_id IS NULL)
    OR (source_type = 'manual' AND service_order_id IS NULL AND customer_service_package_id IS NULL AND sale_id IS NULL)
    OR (source_type = 'service_package' AND customer_service_package_id IS NOT NULL AND service_order_id IS NULL AND sale_id IS NULL)
    OR (source_type = 'sale' AND sale_id IS NOT NULL AND service_order_id IS NULL AND customer_service_package_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS financial_entries_company_sale_uidx
  ON public.financial_entries (company_id, sale_id)
  WHERE source_type = 'sale' AND sale_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- sales + sale_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  sale_number integer NOT NULL,
  customer_id uuid,
  status text NOT NULL DEFAULT 'completed',
  subtotal_cents integer NOT NULL,
  discount_cents integer NOT NULL DEFAULT 0,
  discount_type text,
  discount_percent numeric(6, 2),
  total_cents integer NOT NULL,
  paid_cents integer NOT NULL DEFAULT 0,
  change_cents integer NOT NULL DEFAULT 0,
  financial_entry_id uuid,
  sold_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_by_name text NOT NULL,
  discount_applied_by uuid REFERENCES auth.users (id),
  cancelled_by uuid REFERENCES auth.users (id),
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT sales_status_check CHECK (
    status IN ('open', 'completed', 'partially_paid', 'cancelled')
  ),
  CONSTRAINT sales_discount_type_check CHECK (
    discount_type IS NULL OR discount_type IN ('fixed', 'percent')
  ),
  CONSTRAINT sales_amounts_check CHECK (
    subtotal_cents >= 0
    AND discount_cents >= 0
    AND discount_cents <= subtotal_cents
    AND total_cents >= 0
    AND total_cents <= 99999999
    AND paid_cents >= 0
    AND change_cents >= 0
    AND sale_number > 0
  ),
  CONSTRAINT sales_cancel_reason_length CHECK (
    cancel_reason IS NULL OR char_length(cancel_reason) <= 500
  ),
  CONSTRAINT sales_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT sales_customer_company_fkey
    FOREIGN KEY (customer_id, company_id)
    REFERENCES public.customers (id, company_id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_company_idempotency_uidx
  ON public.sales (company_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS sales_company_number_uidx
  ON public.sales (company_id, sale_number);

CREATE INDEX IF NOT EXISTS idx_sales_company_sold_at
  ON public.sales (company_id, sold_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_company_status
  ON public.sales (company_id, status)
  WHERE cancelled_at IS NULL;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_financial_entry_company_fkey;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_financial_entry_company_fkey
  FOREIGN KEY (financial_entry_id, company_id)
  REFERENCES public.financial_entries (id, company_id)
  ON DELETE SET NULL;

ALTER TABLE public.financial_entries
  DROP CONSTRAINT IF EXISTS financial_entries_sale_company_fkey;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT financial_entries_sale_company_fkey
  FOREIGN KEY (sale_id, company_id)
  REFERENCES public.sales (id, company_id)
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  quantity numeric(14, 3) NOT NULL,
  unit_price_cents integer NOT NULL,
  cost_price_cents_snapshot integer NOT NULL,
  subtotal_cents integer NOT NULL,
  discount_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT sale_items_prices_check CHECK (
    unit_price_cents >= 0
    AND cost_price_cents_snapshot >= 0
    AND subtotal_cents >= 0
    AND total_cents >= 0
  ),
  CONSTRAINT sale_items_name_length CHECK (
    char_length(product_name_snapshot) >= 2
    AND char_length(product_name_snapshot) <= 120
  ),
  CONSTRAINT sale_items_sale_company_fkey
    FOREIGN KEY (sale_id, company_id)
    REFERENCES public.sales (id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT sale_items_product_company_fkey
    FOREIGN KEY (product_id, company_id)
    REFERENCES public.products (id, company_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
  ON public.sale_items (company_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_product_id
  ON public.sale_items (company_id, product_id);

-- ---------------------------------------------------------------------------
-- stock_movements: tipo sale
-- ---------------------------------------------------------------------------

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check CHECK (
    type IN ('entry', 'exit', 'adjustment', 'loss', 'internal_use', 'return', 'sale')
  );

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS sales_set_updated_at ON public.sales;
CREATE TRIGGER sales_set_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sales_prevent_company_change ON public.sales;
CREATE TRIGGER sales_prevent_company_change
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

DROP TRIGGER IF EXISTS sale_items_prevent_company_change ON public.sale_items;
CREATE TRIGGER sale_items_prevent_company_change
  BEFORE UPDATE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION private.prevent_company_change();

-- financial_payments FK after financial_entries exists
ALTER TABLE public.financial_payments
  DROP CONSTRAINT IF EXISTS financial_payments_entry_company_fkey;

ALTER TABLE public.financial_payments
  ADD CONSTRAINT financial_payments_entry_company_fkey
  FOREIGN KEY (financial_entry_id, company_id)
  REFERENCES public.financial_entries (id, company_id)
  ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_select_member ON public.sales;
CREATE POLICY sales_select_member ON public.sales
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS sales_insert_member ON public.sales;
CREATE POLICY sales_insert_member ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS sales_update_member ON public.sales;
CREATE POLICY sales_update_member ON public.sales
  FOR UPDATE TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS sale_items_select_member ON public.sale_items;
CREATE POLICY sale_items_select_member ON public.sale_items
  FOR SELECT TO authenticated USING (private.is_company_member(company_id));

GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT SELECT ON public.sale_items TO authenticated;

-- ---------------------------------------------------------------------------
-- Helpers financeiros
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.sum_active_financial_payments(p_entry_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT coalesce(sum(fp.amount_cents), 0)::integer
  FROM public.financial_payments fp
  WHERE fp.financial_entry_id = p_entry_id
    AND fp.cancelled_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION private.sync_financial_entry_payment_status(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_entry record;
  v_paid integer;
  v_last record;
BEGIN
  SELECT fe.id, fe.amount_cents, fe.status
  INTO v_entry
  FROM public.financial_entries fe
  WHERE fe.id = p_entry_id AND fe.deleted_at IS NULL;

  IF v_entry.id IS NULL OR v_entry.status = 'cancelled' THEN
    RETURN;
  END IF;

  v_paid := private.sum_active_financial_payments(p_entry_id);

  SELECT fp.payment_method, fp.paid_at
  INTO v_last
  FROM public.financial_payments fp
  WHERE fp.financial_entry_id = p_entry_id AND fp.cancelled_at IS NULL
  ORDER BY fp.paid_at DESC, fp.created_at DESC
  LIMIT 1;

  IF v_paid <= 0 THEN
    UPDATE public.financial_entries
    SET status = 'pending', payment_method = NULL, paid_at = NULL
    WHERE id = p_entry_id;
  ELSIF v_paid >= v_entry.amount_cents THEN
    UPDATE public.financial_entries
    SET status = 'paid', payment_method = v_last.payment_method, paid_at = coalesce(v_last.paid_at, now())
    WHERE id = p_entry_id;
  ELSE
    UPDATE public.financial_entries
    SET status = 'partially_paid', payment_method = NULL, paid_at = NULL
    WHERE id = p_entry_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.next_sale_number(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_next integer;
BEGIN
  SELECT coalesce(max(sale_number), 0) + 1 INTO v_next
  FROM public.sales
  WHERE company_id = p_company_id
  FOR UPDATE;

  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION private.deterministic_uuid(p_seed text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    substr(md5(p_seed), 1, 8) || '-' ||
    substr(md5(p_seed), 9, 4) || '-' ||
    substr(md5(p_seed), 13, 4) || '-' ||
    substr(md5(p_seed), 17, 4) || '-' ||
    substr(md5(p_seed), 21, 12)
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION private.stock_movement_key_for_sale(
  p_sale_key uuid,
  p_product_id uuid
)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT private.deterministic_uuid(p_sale_key::text || ':' || p_product_id::text);
$$;

-- ---------------------------------------------------------------------------
-- register_stock_movement — incluir tipo sale
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
  v_exit_type text;
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
  WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_exit_type := CASE WHEN p_type = 'sale' THEN 'exit' ELSE p_type END;

  IF v_exit_type NOT IN ('entry', 'exit', 'adjustment', 'loss', 'internal_use', 'return') THEN
    RAISE EXCEPTION 'invalid_movement_type' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing
  FROM public.stock_movements
  WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF v_product.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'archived_product' USING ERRCODE = '22023';
  END IF;

  v_previous := v_product.current_stock;
  v_cost := v_product.cost_price_cents;
  v_qty := round(coalesce(p_quantity, 0), 3);

  IF v_exit_type = 'adjustment' THEN
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

    IF v_exit_type IN ('entry', 'return') THEN
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

      v_available := greatest(0, v_previous - v_expired);

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
  FROM public.profiles WHERE id = v_user_id;

  PERFORM set_config('petgestor.stock_mutate', 'on', true);

  UPDATE public.products
  SET current_stock = v_new, cost_price_cents = v_cost
  WHERE id = v_product.id AND company_id = v_company_id;

  IF v_exit_type IN ('entry', 'return') AND (p_batch_code IS NOT NULL OR p_expiration_date IS NOT NULL) THEN
    SELECT id INTO v_batch_id
    FROM public.product_batches
    WHERE company_id = v_company_id AND product_id = v_product.id
      AND coalesce(batch_code, '') = coalesce(nullif(trim(p_batch_code), ''), '')
      AND expiration_date IS NOT DISTINCT FROM p_expiration_date
    FOR UPDATE;

    IF v_batch_id IS NULL THEN
      INSERT INTO public.product_batches (
        company_id, product_id, batch_code, quantity_remaining, expiration_date, unit_cost_cents
      ) VALUES (
        v_company_id, v_product.id, nullif(trim(coalesce(p_batch_code, '')), ''),
        v_qty, p_expiration_date, p_unit_cost_cents
      ) RETURNING id INTO v_batch_id;
    ELSE
      UPDATE public.product_batches
      SET quantity_remaining = quantity_remaining + v_qty
      WHERE id = v_batch_id;
    END IF;
  END IF;

  IF (v_exit_type NOT IN ('entry', 'return', 'adjustment'))
     OR (v_exit_type = 'adjustment' AND v_delta < 0) THEN
    v_remaining := v_qty;
    FOR v_batch IN
      SELECT * FROM public.product_batches
      WHERE company_id = v_company_id AND product_id = v_product.id
        AND quantity_remaining > 0
        AND (v_exit_type = 'loss' OR v_exit_type = 'adjustment'
             OR expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
      ORDER BY expiration_date ASC NULLS LAST
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := least(v_batch.quantity_remaining, v_remaining);
      UPDATE public.product_batches SET quantity_remaining = quantity_remaining - v_take
      WHERE id = v_batch.id;
      v_remaining := v_remaining - v_take;
    END LOOP;
  END IF;

  INSERT INTO public.stock_movements (
    company_id, product_id, type, quantity, previous_quantity, new_quantity,
    unit_cost_cents, reason, reference_type, reference_id, notes,
    supplier_id, batch_id, idempotency_key, created_by, created_by_name
  ) VALUES (
    v_company_id, v_product.id, p_type, v_qty, v_previous, v_new,
    coalesce(p_unit_cost_cents, v_product.cost_price_cents),
    nullif(trim(coalesce(p_reason, '')), ''),
    nullif(trim(coalesce(p_reference_type, '')), ''),
    p_reference_id,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_supplier_id, v_batch_id, p_idempotency_key, v_user_id, coalesce(v_name, 'Usuário')
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing FROM public.stock_movements
    WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: complete_product_sale
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_product_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_payments jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount_type text DEFAULT NULL,
  p_discount_fixed_cents integer DEFAULT 0,
  p_discount_percent numeric DEFAULT NULL,
  p_cash_received_cents integer DEFAULT NULL
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
  v_existing_sale uuid;
  v_sale_id uuid;
  v_sale_number integer;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_total integer;
  v_paid integer := 0;
  v_change integer := 0;
  v_status text;
  v_entry_id uuid;
  v_item jsonb;
  v_pay jsonb;
  v_product public.products%ROWTYPE;
  v_qty numeric(14, 3);
  v_unit_price integer;
  v_line_subtotal integer;
  v_expired numeric(14, 3);
  v_available numeric(14, 3);
  v_pay_sum integer := 0;
  v_pay_amount integer;
  v_pay_key text;
  v_movement_key uuid;
  v_description text;
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

  SELECT id INTO v_existing_sale FROM public.sales
  WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;

  IF v_existing_sale IS NOT NULL THEN
    RETURN v_existing_sale;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_sale_items' USING ERRCODE = '22023';
  END IF;

  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'empty_payments' USING ERRCODE = '22023';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    PERFORM 1 FROM public.customers
    WHERE id = p_customer_id AND company_id = v_company_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'product_id'
  LOOP
    v_qty := round((v_item->>'quantity')::numeric, 3);
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND company_id = v_company_id
    FOR UPDATE;

    IF NOT FOUND OR v_product.archived_at IS NOT NULL OR NOT v_product.active THEN
      RAISE EXCEPTION 'product_not_available' USING ERRCODE = '22023';
    END IF;

    IF v_product.track_stock THEN
      SELECT coalesce(sum(quantity_remaining), 0) INTO v_expired
      FROM public.product_batches
      WHERE company_id = v_company_id AND product_id = v_product.id
        AND quantity_remaining > 0 AND expiration_date IS NOT NULL
        AND expiration_date < CURRENT_DATE;

      v_available := greatest(0, v_product.current_stock - v_expired);
      IF v_qty > v_available THEN
        RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '22023';
      END IF;
    END IF;

    v_unit_price := coalesce((v_item->>'unit_price_cents')::integer, v_product.sale_price_cents);
    IF v_unit_price IS NULL OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'invalid_unit_price' USING ERRCODE = '22023';
    END IF;

    v_line_subtotal := round(v_qty * v_unit_price);
    v_subtotal := v_subtotal + v_line_subtotal;
  END LOOP;

  IF p_discount_type = 'fixed' THEN
    v_discount := greatest(0, coalesce(p_discount_fixed_cents, 0));
  ELSIF p_discount_type = 'percent' THEN
    IF p_discount_percent IS NULL OR p_discount_percent < 0 OR p_discount_percent > 100 THEN
      RAISE EXCEPTION 'invalid_discount' USING ERRCODE = '22023';
    END IF;
    v_discount := round(v_subtotal * p_discount_percent / 100.0);
  ELSE
    v_discount := 0;
  END IF;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'discount_exceeds_subtotal' USING ERRCODE = '22023';
  END IF;

  v_total := v_subtotal - v_discount;

  FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_pay_amount := (v_pay->>'amount_cents')::integer;
    IF v_pay_amount IS NULL OR v_pay_amount <= 0 THEN
      RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
    END IF;
    IF v_pay->>'payment_method' NOT IN ('cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other') THEN
      RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
    END IF;
    v_pay_sum := v_pay_sum + v_pay_amount;
  END LOOP;

  IF v_pay_sum > v_total THEN
    IF p_cash_received_cents IS NOT NULL AND p_cash_received_cents >= v_pay_sum THEN
      v_change := p_cash_received_cents - v_total;
      v_paid := v_total;
    ELSE
      RAISE EXCEPTION 'payment_exceeds_total' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_paid := v_pay_sum;
    v_change := 0;
  END IF;

  IF v_paid = 0 THEN
    v_status := 'completed';
  ELSIF v_paid >= v_total THEN
    v_status := 'completed';
  ELSE
    v_status := 'partially_paid';
  END IF;

  SELECT coalesce(nullif(trim(full_name), ''), 'Usuário') INTO v_name
  FROM public.profiles WHERE id = v_user_id;

  v_sale_number := private.next_sale_number(v_company_id);

  INSERT INTO public.sales (
    company_id, sale_number, customer_id, status,
    subtotal_cents, discount_cents, discount_type, discount_percent, total_cents,
    paid_cents, change_cents, sold_at, idempotency_key,
    created_by, created_by_name, discount_applied_by
  ) VALUES (
    v_company_id, v_sale_number, p_customer_id, v_status,
    v_subtotal, v_discount, p_discount_type, p_discount_percent, v_total,
    v_paid, v_change, now(), p_idempotency_key,
    v_user_id, v_name,
    CASE WHEN v_discount > 0 THEN v_user_id ELSE NULL END
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND company_id = v_company_id;

    v_qty := round((v_item->>'quantity')::numeric, 3);
    v_unit_price := coalesce((v_item->>'unit_price_cents')::integer, v_product.sale_price_cents);
    v_line_subtotal := round(v_qty * v_unit_price);

    INSERT INTO public.sale_items (
      company_id, sale_id, product_id, product_name_snapshot, quantity,
      unit_price_cents, cost_price_cents_snapshot, subtotal_cents, discount_cents, total_cents
    ) VALUES (
      v_company_id, v_sale_id, v_product.id, v_product.name, v_qty,
      v_unit_price, v_product.cost_price_cents, v_line_subtotal, 0, v_line_subtotal
    );

    IF v_product.track_stock THEN
      v_movement_key := private.stock_movement_key_for_sale(p_idempotency_key, v_product.id);
      PERFORM public.register_stock_movement(
        v_product.id, 'sale', v_qty, v_movement_key,
        v_product.cost_price_cents, 'sale', NULL, NULL, NULL, NULL, NULL,
        'sale', v_sale_id
      );
    END IF;
  END LOOP;

  v_description := 'Venda #' || v_sale_number::text;

  INSERT INTO public.financial_entries (
    company_id, entry_type, status, source_type, sale_id,
    description, category, amount_cents, due_date, created_by
  ) VALUES (
    v_company_id, 'income', 'pending', 'sale', v_sale_id,
    v_description, 'Produtos', v_total, CURRENT_DATE, v_user_id
  ) RETURNING id INTO v_entry_id;

  UPDATE public.sales SET financial_entry_id = v_entry_id WHERE id = v_sale_id;

  FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_pay_key := v_pay->>'idempotency_key';
    INSERT INTO public.financial_payments (
      company_id, financial_entry_id, amount_cents, payment_method,
      paid_at, idempotency_key, created_by
    ) VALUES (
      v_company_id, v_entry_id, (v_pay->>'amount_cents')::integer,
      v_pay->>'payment_method', now(), v_pay_key, v_user_id
    );
  END LOOP;

  PERFORM private.sync_financial_entry_payment_status(v_entry_id);

  RETURN v_sale_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_sale FROM public.sales
    WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;
    IF v_existing_sale IS NOT NULL THEN RETURN v_existing_sale; END IF;
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel_product_sale
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_product_sale(
  p_sale_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_sale record;
  v_item record;
  v_movement_key uuid;
  v_reason text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required' USING ERRCODE = '42501';
  END IF;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'invalid_cancel_reason' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sale FROM public.sales
  WHERE id = p_sale_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'sale_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_sale.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'sale_already_cancelled' USING ERRCODE = '22023';
  END IF;

  IF v_sale.status NOT IN ('completed', 'partially_paid') THEN
    RAISE EXCEPTION 'invalid_sale_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sales
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_user_id, cancel_reason = v_reason
  WHERE id = p_sale_id;

  IF v_sale.financial_entry_id IS NOT NULL THEN
    UPDATE public.financial_payments
    SET cancelled_at = now(), cancelled_by = v_user_id
    WHERE financial_entry_id = v_sale.financial_entry_id AND cancelled_at IS NULL;

    UPDATE public.financial_entries
    SET status = 'cancelled', cancelled_at = now()
    WHERE id = v_sale.financial_entry_id;
  END IF;

  FOR v_item IN
    SELECT si.*, p.track_stock
    FROM public.sale_items si
    JOIN public.products p ON p.id = si.product_id AND p.company_id = si.company_id
    WHERE si.sale_id = p_sale_id AND si.company_id = v_company_id
  LOOP
    IF v_item.track_stock THEN
      v_movement_key := private.stock_movement_key_for_sale(
        private.deterministic_uuid('cancel:' || p_sale_id::text || ':' || v_item.id::text),
        v_item.product_id
      );
      PERFORM public.register_stock_movement(
        v_item.product_id, 'return', v_item.quantity, v_movement_key,
        v_item.cost_price_cents_snapshot, 'sale_cancelled', v_reason,
        NULL, NULL, NULL, NULL, 'sale', p_sale_id
      );
    END IF;
  END LOOP;

  RETURN p_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_product_sale(uuid, jsonb, jsonb, uuid, text, integer, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_product_sale(uuid, jsonb, jsonb, uuid, text, integer, numeric, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_product_sale(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_product_sale(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.register_stock_movement(
  uuid, text, numeric, uuid, integer, text, text, uuid, text, date, numeric, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_stock_movement(
  uuid, text, numeric, uuid, integer, text, text, uuid, text, date, numeric, text, uuid
) TO authenticated;
