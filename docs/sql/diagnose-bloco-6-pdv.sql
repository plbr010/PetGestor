-- PetGestor BLOCO 6 — diagnóstico somente leitura do PDV.
-- Não altera dados. Use no SQL Editor para reconciliação manual.
--
-- Fonte canônica:
--   preço/total da venda = snapshot em sale_items (oficial no checkout)
--   recebido = SUM(financial_payments.amount_cents WHERE cancelled_at IS NULL)
--   cash_received_cents = dinheiro tendered (não é payment)
--   change_cents = cash_received − payment cash aplicado (não é receita)

-- 1. sale total diferente da soma de sale_items (desconto à parte)
SELECT
  s.company_id,
  s.id AS sale_id,
  s.sale_number,
  s.subtotal_cents,
  s.discount_cents,
  s.total_cents,
  coalesce(sum(si.subtotal_cents), 0) AS items_subtotal_cents
FROM public.sales s
LEFT JOIN public.sale_items si
  ON si.sale_id = s.id AND si.company_id = s.company_id
GROUP BY s.company_id, s.id
HAVING s.subtotal_cents IS DISTINCT FROM coalesce(sum(si.subtotal_cents), 0)
    OR s.total_cents IS DISTINCT FROM (s.subtotal_cents - s.discount_cents);

-- 2. sale_item com preço zero/anômalo
SELECT
  si.company_id,
  si.sale_id,
  si.id AS sale_item_id,
  si.product_id,
  si.unit_price_cents,
  si.quantity,
  si.subtotal_cents
FROM public.sale_items si
WHERE si.unit_price_cents <= 0
   OR si.subtotal_cents IS DISTINCT FROM round(si.quantity * si.unit_price_cents)
   OR si.total_cents < 0;

-- 3. sale sem financial_entry
SELECT
  s.company_id,
  s.id AS sale_id,
  s.status,
  s.total_cents,
  s.financial_entry_id
FROM public.sales s
WHERE s.cancelled_at IS NULL
  AND (
    s.financial_entry_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.financial_entries fe
      WHERE fe.sale_id = s.id
        AND fe.company_id = s.company_id
        AND fe.source_type = 'sale'
        AND fe.deleted_at IS NULL
    )
  );

-- 4. financial_entry de sale sem sale
SELECT
  fe.company_id,
  fe.id AS financial_entry_id,
  fe.sale_id,
  fe.status,
  fe.amount_cents
FROM public.financial_entries fe
WHERE fe.source_type = 'sale'
  AND fe.deleted_at IS NULL
  AND (
    fe.sale_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = fe.sale_id AND s.company_id = fe.company_id
    )
  );

-- 5. payments da sale diferentes do total devido (venda concluída)
SELECT
  s.company_id,
  s.id AS sale_id,
  s.status,
  s.total_cents,
  s.paid_cents,
  coalesce(sum(fp.amount_cents) FILTER (WHERE fp.cancelled_at IS NULL), 0) AS received_cents
FROM public.sales s
LEFT JOIN public.financial_entries fe
  ON fe.id = s.financial_entry_id AND fe.company_id = s.company_id
LEFT JOIN public.financial_payments fp
  ON fp.financial_entry_id = fe.id AND fp.company_id = s.company_id
WHERE s.cancelled_at IS NULL
  AND s.status = 'completed'
GROUP BY s.company_id, s.id
HAVING coalesce(sum(fp.amount_cents) FILTER (WHERE fp.cancelled_at IS NULL), 0)
       IS DISTINCT FROM s.total_cents;

-- 6. estoque negativo
SELECT
  p.company_id,
  p.id AS product_id,
  p.name,
  p.current_stock
FROM public.products p
WHERE p.current_stock < 0;

-- 7. sale sem movimento de estoque (produtos com track_stock)
SELECT
  s.company_id,
  s.id AS sale_id,
  si.product_id,
  si.quantity
FROM public.sales s
INNER JOIN public.sale_items si
  ON si.sale_id = s.id AND si.company_id = s.company_id
INNER JOIN public.products p
  ON p.id = si.product_id AND p.company_id = si.company_id
WHERE s.cancelled_at IS NULL
  AND p.track_stock = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.company_id = s.company_id
      AND sm.product_id = si.product_id
      AND sm.reference_type = 'sale'
      AND sm.reference_id = s.id
      AND sm.type = 'sale'
  );

-- 8. possível duplicidade de checkout (mesma fingerprint em keys distintas)
SELECT
  s.company_id,
  s.checkout_fingerprint,
  count(*) AS sale_count,
  array_agg(s.id) AS sale_ids
FROM public.sales s
WHERE s.checkout_fingerprint IS NOT NULL
  AND s.checkout_fingerprint NOT LIKE 'legacy:%'
GROUP BY s.company_id, s.checkout_fingerprint
HAVING count(*) > 1;

-- 9. cash_received / troco incoerente
SELECT
  s.company_id,
  s.id AS sale_id,
  s.total_cents,
  s.cash_received_cents,
  s.change_cents,
  coalesce(sum(fp.amount_cents) FILTER (
    WHERE fp.cancelled_at IS NULL AND fp.payment_method = 'cash'
  ), 0) AS cash_payment_cents
FROM public.sales s
LEFT JOIN public.financial_entries fe
  ON fe.id = s.financial_entry_id AND fe.company_id = s.company_id
LEFT JOIN public.financial_payments fp
  ON fp.financial_entry_id = fe.id AND fp.company_id = s.company_id
WHERE s.cancelled_at IS NULL
  AND s.cash_received_cents > 0
GROUP BY s.company_id, s.id
HAVING s.change_cents IS DISTINCT FROM greatest(
         0,
         s.cash_received_cents - coalesce(sum(fp.amount_cents) FILTER (
           WHERE fp.cancelled_at IS NULL AND fp.payment_method = 'cash'
         ), 0)
       );
