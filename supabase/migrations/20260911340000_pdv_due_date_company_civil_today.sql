-- PetGestor BLOCO 6 hardening — due_date civil da empresa na venda PDV.
-- Incremental. NÃO edita migrations anteriores (BLOCOs 1–6 inclusive).
-- Não reseta banco, não apaga vendas/estoque/pagamentos, não desabilita RLS.
-- Não inicia BLOCO 7 (relatórios).
--
-- Pendência única: financial_entries.due_date da venda PDV.
-- CURRENT_DATE segue a sessão/servidor (tipicamente UTC) e pode cair no dia
-- civil seguinte quando a empresa ainda está no dia anterior.
--
-- Regra (reutiliza private.company_civil_today do BLOCO 4):
--   due_date = dia civil atual da empresa (companies.timezone).
-- sold_at, paid_at e created_at continuam timestamptz (now()).

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
        AND expiration_date < private.company_civil_today(v_company_id);

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
    v_description, 'Produtos', v_total, private.company_civil_today(v_company_id), v_user_id
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
