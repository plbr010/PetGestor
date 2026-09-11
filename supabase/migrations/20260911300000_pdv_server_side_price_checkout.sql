-- PetGestor BLOCO 6 — PDV: preço/total server-side, checkout atômico,
-- idempotência, estoque concorrente, pagamentos mistos, cash_received/troco,
-- caixa e cancelamento seguro.
-- Incremental. Não edita migrations dos BLOCOs 1–5/hardening.
-- Não reseta banco, não apaga vendas/estoque/pagamentos, não desabilita RLS.

-- ---------------------------------------------------------------------------
-- 1. Colunas de auditoria do checkout (cash tendered ≠ payment)
-- ---------------------------------------------------------------------------

ALTER TABLE public.cash_sessions
  DROP CONSTRAINT IF EXISTS cash_sessions_id_company_id_key;

ALTER TABLE public.cash_sessions
  ADD CONSTRAINT cash_sessions_id_company_id_key UNIQUE (id, company_id);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cash_received_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cash_session_id uuid;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS checkout_fingerprint text;

UPDATE public.sales
SET checkout_fingerprint = 'legacy:' || id::text
WHERE checkout_fingerprint IS NULL;

ALTER TABLE public.sales
  ALTER COLUMN checkout_fingerprint SET NOT NULL;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_cash_received_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_cash_received_check CHECK (
    cash_received_cents >= 0 AND cash_received_cents <= 99999999
  );

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_cash_session_company_fkey;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_cash_session_company_fkey
  FOREIGN KEY (cash_session_id, company_id)
  REFERENCES public.cash_sessions (id, company_id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.sales.cash_received_cents IS
  'Dinheiro físico entregue pelo cliente (tendered). Não é o financial_payment cash.';

COMMENT ON COLUMN public.sales.change_cents IS
  'Troco = cash_received − payment cash aplicado. Não é receita.';

COMMENT ON COLUMN public.sales.checkout_fingerprint IS
  'Payload material do checkout (itens, desconto, pagamentos, cash tendered) para replay da idempotency_key.';

COMMENT ON COLUMN public.sale_items.unit_price_cents IS
  'Snapshot do preço oficial do catálogo no momento da venda. Nunca aceitar preço do cliente.';

-- ---------------------------------------------------------------------------
-- 2. Fingerprint canônico do checkout
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.sale_checkout_fingerprint(
  p_items jsonb,
  p_payments jsonb,
  p_customer_id uuid,
  p_discount_type text,
  p_discount_fixed_cents integer,
  p_discount_percent numeric,
  p_cash_received_cents integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, private
AS $$
DECLARE
  v_items text;
  v_payments text;
  v_discount_percent text;
BEGIN
  SELECT coalesce(
    string_agg(product_id::text || ':' || to_char(quantity, 'FM999999990.000'), ',' ORDER BY product_id),
    ''
  )
  INTO v_items
  FROM (
    SELECT
      (item->>'product_id')::uuid AS product_id,
      round(sum((item->>'quantity')::numeric), 3) AS quantity
    FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
    GROUP BY 1
  ) grouped;

  SELECT coalesce(
    string_agg(
      (pay->>'payment_method') || ':' || (pay->>'amount_cents'),
      ','
      ORDER BY pay->>'payment_method', (pay->>'amount_cents')::integer
    ),
    ''
  )
  INTO v_payments
  FROM jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) pay;

  IF p_discount_percent IS NULL THEN
    v_discount_percent := '';
  ELSE
    v_discount_percent := to_char(round(p_discount_percent, 2), 'FM9990.00');
  END IF;

  RETURN md5(
    'items=' || v_items
    || '|customer=' || coalesce(p_customer_id::text, '')
    || '|discount=' || coalesce(p_discount_type, '') || ':'
      || coalesce(p_discount_fixed_cents, 0)::text || ':'
      || v_discount_percent
    || '|payments=' || v_payments
    || '|cash=' || coalesce(p_cash_received_cents, 0)::text
    || '|session='
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Estoque: UPDATE atômico (não só SELECT antes do UPDATE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.register_stock_movement(
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
  WHERE id = v_product.id
    AND company_id = v_company_id
    AND current_stock = v_previous
    AND v_new >= 0
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '22023';
  END IF;

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
      UPDATE public.product_batches
      SET quantity_remaining = quantity_remaining - v_take
      WHERE id = v_batch.id
        AND quantity_remaining >= v_take;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '22023';
      END IF;
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
-- 4. Checkout atômico: preço oficial, total server-side, pagamentos, estoque
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.complete_product_sale(
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
  v_existing_sale record;
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
  v_pay_amount integer;
  v_pay_key text;
  v_movement_key uuid;
  v_description text;
  v_fingerprint text;
  v_product_id uuid;
  v_merged jsonb := '{}'::jsonb;
  v_qty_existing numeric;
  v_non_cash integer := 0;
  v_requested_cash integer := 0;
  v_applied_cash integer := 0;
  v_cash_received integer := 0;
  v_has_cash boolean := false;
  v_remaining_after_non_cash integer;
  v_cash_left integer;
  v_take integer;
  v_cash_session_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_company_id::text || ':' || p_idempotency_key::text, 0)
  );

  v_fingerprint := private.sale_checkout_fingerprint(
    p_items,
    p_payments,
    p_customer_id,
    p_discount_type,
    p_discount_fixed_cents,
    p_discount_percent,
    p_cash_received_cents
  );

  SELECT id, checkout_fingerprint
  INTO v_existing_sale
  FROM public.sales
  WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;

  IF v_existing_sale.id IS NOT NULL THEN
    IF v_existing_sale.checkout_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing_sale.id;
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
      RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_product_id := (v_item->>'product_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
    END;

    v_qty := round((v_item->>'quantity')::numeric, 3);
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 999999.999 THEN
      RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
    END IF;

    v_qty_existing := coalesce((v_merged->>v_product_id::text)::numeric, 0);
    v_merged := jsonb_set(v_merged, ARRAY[v_product_id::text], to_jsonb(v_qty_existing + v_qty));
  END LOOP;

  FOR v_product_id IN
    SELECT key::uuid FROM jsonb_each_text(v_merged) ORDER BY key
  LOOP
    v_qty := (v_merged->>v_product_id::text)::numeric;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND company_id = v_company_id
    FOR UPDATE;

    IF NOT FOUND OR v_product.archived_at IS NOT NULL OR NOT v_product.active THEN
      RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
    END IF;

    -- Preço oficial do catálogo. unit_price/price_cents do cliente são ignorados.
    v_unit_price := v_product.sale_price_cents;
    IF v_unit_price IS NULL OR v_unit_price <= 0 OR v_unit_price > 99999999 THEN
      RAISE EXCEPTION 'invalid_price_cents' USING ERRCODE = '22023';
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

    IF v_qty * v_unit_price > 99999999 THEN
      RAISE EXCEPTION 'amount_overflow' USING ERRCODE = '22023';
    END IF;

    v_line_subtotal := round(v_qty * v_unit_price);
    IF v_subtotal > 99999999 - v_line_subtotal THEN
      RAISE EXCEPTION 'amount_overflow' USING ERRCODE = '22023';
    END IF;
    v_subtotal := v_subtotal + v_line_subtotal;
  END LOOP;

  IF p_discount_type IS NULL OR p_discount_type = '' THEN
    v_discount := 0;
    p_discount_type := NULL;
  ELSIF p_discount_type = 'fixed' THEN
    v_discount := greatest(0, coalesce(p_discount_fixed_cents, 0));
  ELSIF p_discount_type = 'percent' THEN
    IF p_discount_percent IS NULL OR p_discount_percent < 0 OR p_discount_percent > 100 THEN
      RAISE EXCEPTION 'invalid_discount' USING ERRCODE = '22023';
    END IF;
    v_discount := round(v_subtotal * p_discount_percent / 100.0);
  ELSE
    RAISE EXCEPTION 'invalid_discount' USING ERRCODE = '22023';
  END IF;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'discount_exceeds_subtotal' USING ERRCODE = '22023';
  END IF;

  IF v_discount > 0 AND NOT private.has_app_permission(v_company_id, 'pos.apply_discount') THEN
    RAISE EXCEPTION 'discount_permission_required' USING ERRCODE = '42501';
  END IF;

  v_total := v_subtotal - v_discount;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'sale_total_zero' USING ERRCODE = '22023';
  END IF;

  FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_pay_amount := (v_pay->>'amount_cents')::integer;
    IF v_pay_amount IS NULL OR v_pay_amount <= 0 OR v_pay_amount > 99999999 THEN
      RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
    END IF;
    IF v_pay->>'payment_method' NOT IN ('cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other') THEN
      RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
    END IF;
    IF v_pay->>'payment_method' = 'cash' THEN
      v_has_cash := true;
      v_requested_cash := v_requested_cash + v_pay_amount;
    ELSE
      v_non_cash := v_non_cash + v_pay_amount;
    END IF;
  END LOOP;

  IF v_non_cash > v_total THEN
    RAISE EXCEPTION 'payment_exceeds_total' USING ERRCODE = '22023';
  END IF;

  v_remaining_after_non_cash := v_total - v_non_cash;

  IF v_has_cash AND v_remaining_after_non_cash = 0 THEN
    RAISE EXCEPTION 'payment_exceeds_total' USING ERRCODE = '22023';
  END IF;

  IF NOT v_has_cash THEN
    v_applied_cash := 0;
    v_cash_received := 0;
    v_change := 0;
    v_paid := v_non_cash;
  ELSE
    IF p_cash_received_cents IS NULL AND v_requested_cash > v_remaining_after_non_cash THEN
      RAISE EXCEPTION 'payment_exceeds_total' USING ERRCODE = '22023';
    END IF;

    v_cash_received := coalesce(p_cash_received_cents, v_requested_cash);
    IF v_cash_received < 0 OR v_cash_received > 99999999 THEN
      RAISE EXCEPTION 'invalid_cash_received' USING ERRCODE = '22023';
    END IF;

    v_applied_cash := least(v_requested_cash, v_remaining_after_non_cash, v_cash_received);
    v_change := greatest(0, v_cash_received - v_applied_cash);
    v_paid := v_non_cash + v_applied_cash;
  END IF;

  IF v_paid > v_total THEN
    RAISE EXCEPTION 'payment_exceeds_total' USING ERRCODE = '22023';
  END IF;

  IF v_paid <= 0 THEN
    RAISE EXCEPTION 'empty_payments' USING ERRCODE = '22023';
  END IF;

  IF v_paid >= v_total THEN
    v_status := 'completed';
  ELSE
    v_status := 'partially_paid';
  END IF;

  IF v_has_cash THEN
    SELECT id INTO v_cash_session_id
    FROM public.cash_sessions
    WHERE company_id = v_company_id AND status = 'open'
    FOR UPDATE;

    IF v_cash_session_id IS NULL THEN
      RAISE EXCEPTION 'cash_session_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT coalesce(nullif(trim(full_name), ''), 'Usuário') INTO v_name
  FROM public.profiles WHERE id = v_user_id;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('sale-number:' || v_company_id::text, 0)
  );
  v_sale_number := private.next_sale_number(v_company_id);

  INSERT INTO public.sales (
    company_id, sale_number, customer_id, status,
    subtotal_cents, discount_cents, discount_type, discount_percent, total_cents,
    paid_cents, change_cents, cash_received_cents, cash_session_id,
    checkout_fingerprint, sold_at, idempotency_key,
    created_by, created_by_name, discount_applied_by
  ) VALUES (
    v_company_id, v_sale_number, p_customer_id, v_status,
    v_subtotal, v_discount, p_discount_type, p_discount_percent, v_total,
    v_paid, v_change, v_cash_received, v_cash_session_id,
    v_fingerprint, now(), p_idempotency_key,
    v_user_id, v_name,
    CASE WHEN v_discount > 0 THEN v_user_id ELSE NULL END
  ) RETURNING id INTO v_sale_id;

  FOR v_product_id IN
    SELECT key::uuid FROM jsonb_each_text(v_merged) ORDER BY key
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND company_id = v_company_id;

    v_qty := (v_merged->>v_product_id::text)::numeric;
    v_unit_price := v_product.sale_price_cents;
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
      PERFORM private.register_stock_movement(
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

  UPDATE public.sales SET financial_entry_id = v_entry_id WHERE id = v_sale_id AND company_id = v_company_id;

  FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    IF v_pay->>'payment_method' = 'cash' THEN
      CONTINUE;
    END IF;
    v_pay_key := v_pay->>'idempotency_key';
    INSERT INTO public.financial_payments (
      company_id, financial_entry_id, amount_cents, payment_method,
      paid_at, idempotency_key, created_by
    ) VALUES (
      v_company_id, v_entry_id, (v_pay->>'amount_cents')::integer,
      v_pay->>'payment_method', now(), v_pay_key, v_user_id
    );
  END LOOP;

  v_cash_left := v_applied_cash;
  FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    EXIT WHEN v_cash_left <= 0;
    IF v_pay->>'payment_method' IS DISTINCT FROM 'cash' THEN
      CONTINUE;
    END IF;
    v_take := least((v_pay->>'amount_cents')::integer, v_cash_left);
    IF v_take <= 0 THEN
      CONTINUE;
    END IF;
    v_pay_key := v_pay->>'idempotency_key';
    INSERT INTO public.financial_payments (
      company_id, financial_entry_id, amount_cents, payment_method,
      paid_at, idempotency_key, created_by
    ) VALUES (
      v_company_id, v_entry_id, v_take,
      'cash', now(), v_pay_key, v_user_id
    );
    v_cash_left := v_cash_left - v_take;
  END LOOP;

  PERFORM private.sync_financial_entry_payment_status(v_entry_id);

  RETURN v_sale_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id, checkout_fingerprint
    INTO v_existing_sale
    FROM public.sales
    WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;
    IF v_existing_sale.id IS NOT NULL THEN
      IF v_existing_sale.checkout_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '22023';
      END IF;
      RETURN v_existing_sale.id;
    END IF;
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Cancelamento: venda paga exige refund (sem estorno silencioso)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cancel_product_sale(
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
  v_reason text;
  v_active_payments integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'invalid_cancel_reason' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sale FROM public.sales
  WHERE id = p_sale_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_sale.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'sale_already_cancelled' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_active_payments
  FROM public.financial_payments
  WHERE financial_entry_id = v_sale.financial_entry_id
    AND company_id = v_company_id
    AND cancelled_at IS NULL;

  IF v_sale.paid_cents > 0
     OR coalesce(v_active_payments, 0) > 0
     OR v_sale.status IN ('completed', 'partially_paid')
  THEN
    RAISE EXCEPTION 'sale_paid_requires_refund' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sales
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_user_id, cancel_reason = v_reason
  WHERE id = p_sale_id AND company_id = v_company_id;

  RETURN p_sale_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Pagamento adicional: SUM(financial_payments) é a fonte canônica
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.register_sale_payment(
  p_sale_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_idempotency_key text,
  p_paid_at timestamptz DEFAULT now()
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
  v_remaining integer;
  v_paid integer;
  v_status text;
  v_existing uuid;
  v_payment_id uuid;
  v_paid_at timestamptz;
  v_cash_session uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();
  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN (
    'cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  v_paid_at := coalesce(p_paid_at, now());

  SELECT id INTO v_existing
  FROM public.financial_payments
  WHERE company_id = v_company_id
    AND idempotency_key = p_idempotency_key
    AND cancelled_at IS NULL
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_sale.cancelled_at IS NOT NULL OR v_sale.status = 'cancelled' THEN
    RAISE EXCEPTION 'sale_already_cancelled' USING ERRCODE = '22023';
  END IF;

  IF v_sale.status NOT IN ('partially_paid', 'completed') THEN
    RAISE EXCEPTION 'invalid_sale_status' USING ERRCODE = '22023';
  END IF;

  IF v_sale.financial_entry_id IS NULL THEN
    RAISE EXCEPTION 'sale_missing_financial_entry' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.financial_entries
  WHERE id = v_sale.financial_entry_id AND company_id = v_company_id
  FOR UPDATE;

  v_paid := private.sum_active_financial_payments(v_sale.financial_entry_id);
  v_remaining := v_sale.total_cents - v_paid;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'sale_already_paid' USING ERRCODE = '22023';
  END IF;

  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'payment_exceeds_balance' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method = 'cash' THEN
    SELECT id INTO v_cash_session
    FROM public.cash_sessions
    WHERE company_id = v_company_id AND status = 'open'
    FOR UPDATE;

    IF v_cash_session IS NULL THEN
      RAISE EXCEPTION 'cash_session_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.financial_payments (
    company_id, financial_entry_id, amount_cents, payment_method,
    paid_at, idempotency_key, created_by
  ) VALUES (
    v_company_id, v_sale.financial_entry_id, p_amount_cents, p_payment_method,
    v_paid_at, p_idempotency_key, v_user_id
  )
  RETURNING id INTO v_payment_id;

  v_paid := private.sum_active_financial_payments(v_sale.financial_entry_id);
  IF v_paid > v_sale.total_cents THEN
    RAISE EXCEPTION 'payment_exceeds_balance' USING ERRCODE = '22023';
  END IF;

  IF v_paid >= v_sale.total_cents THEN
    v_status := 'completed';
  ELSE
    v_status := 'partially_paid';
  END IF;

  UPDATE public.sales
  SET paid_cents = v_paid, status = v_status
  WHERE id = p_sale_id AND company_id = v_company_id;

  PERFORM private.sync_financial_entry_payment_status(v_sale.financial_entry_id);

  RETURN v_payment_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing
    FROM public.financial_payments
    WHERE company_id = v_company_id
      AND idempotency_key = p_idempotency_key
      AND cancelled_at IS NULL
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
    RAISE;
END;
$$;
