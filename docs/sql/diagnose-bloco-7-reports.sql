-- PetGestor BLOCO 7 — diagnóstico somente leitura de relatórios.
-- Não altera dados. Use no SQL Editor para reconciliação manual.
--
-- Período analítico canônico: timestamptz half-open [start, endExclusive)
-- no fuso da empresa. Datas civis (DATE) comparam YYYY-MM-DD.

-- 1. sale cancelada com sale_items (não deve entrar em ranking/margem operacional)
SELECT
  s.company_id,
  s.id AS sale_id,
  s.status,
  s.sold_at,
  si.id AS sale_item_id,
  si.product_id,
  si.product_name_snapshot,
  si.quantity,
  si.total_cents
FROM public.sales s
INNER JOIN public.sale_items si
  ON si.sale_id = s.id AND si.company_id = s.company_id
WHERE s.status = 'cancelled';

-- 2. movimento de estoque com tipo fora do enum conhecido
SELECT
  sm.company_id,
  sm.id AS movement_id,
  sm.product_id,
  sm.type,
  sm.quantity,
  sm.previous_quantity,
  sm.new_quantity,
  sm.created_at
FROM public.stock_movements sm
WHERE sm.type NOT IN ('entry', 'exit', 'adjustment', 'loss', 'internal_use', 'return', 'sale');

-- 3. current_stock que não reconcilia com a soma assinada dos movimentos
SELECT
  p.company_id,
  p.id AS product_id,
  p.name,
  p.current_stock,
  coalesce(sum(
    CASE
      WHEN sm.type IN ('entry', 'return') THEN sm.quantity
      WHEN sm.type IN ('sale', 'internal_use', 'exit', 'loss') THEN -sm.quantity
      WHEN sm.type = 'adjustment' THEN sm.new_quantity - sm.previous_quantity
      ELSE sm.new_quantity - sm.previous_quantity
    END
  ), 0) AS movements_signed_sum,
  p.current_stock - coalesce(sum(
    CASE
      WHEN sm.type IN ('entry', 'return') THEN sm.quantity
      WHEN sm.type IN ('sale', 'internal_use', 'exit', 'loss') THEN -sm.quantity
      WHEN sm.type = 'adjustment' THEN sm.new_quantity - sm.previous_quantity
      ELSE sm.new_quantity - sm.previous_quantity
    END
  ), 0) AS divergence
FROM public.products p
LEFT JOIN public.stock_movements sm
  ON sm.product_id = p.id AND sm.company_id = p.company_id
WHERE p.track_stock = true
GROUP BY p.company_id, p.id
HAVING p.current_stock IS DISTINCT FROM coalesce(sum(
  CASE
    WHEN sm.type IN ('entry', 'return') THEN sm.quantity
    WHEN sm.type IN ('sale', 'internal_use', 'exit', 'loss') THEN -sm.quantity
    WHEN sm.type = 'adjustment' THEN sm.new_quantity - sm.previous_quantity
    ELSE sm.new_quantity - sm.previous_quantity
  END
), 0);

-- 4. pacote cancelled + financial paid (legado — não auto-corrigir)
SELECT
  csp.company_id,
  csp.id AS customer_package_id,
  csp.status AS operational_status,
  fe.status AS financial_status,
  fe.amount_cents,
  csp.price_cents_snapshot
FROM public.customer_service_packages csp
INNER JOIN public.financial_entries fe
  ON fe.customer_service_package_id = csp.id
 AND fe.company_id = csp.company_id
 AND fe.source_type = 'service_package'
 AND fe.deleted_at IS NULL
WHERE csp.status = 'cancelled'
  AND fe.status = 'paid';

-- 5. pacote active já expirado pela data civil da empresa
SELECT
  csp.company_id,
  csp.id AS customer_package_id,
  csp.status,
  csp.expires_at,
  private.company_civil_today(csp.company_id) AS company_today
FROM public.customer_service_packages csp
WHERE csp.status = 'active'
  AND csp.expires_at < private.company_civil_today(csp.company_id);

-- 6. appointments soft-deleted que ainda teriam scheduled_start no período
SELECT
  a.company_id,
  a.id AS appointment_id,
  a.status,
  a.scheduled_start,
  a.deleted_at
FROM public.appointments a
WHERE a.deleted_at IS NOT NULL;

-- 7. customers/pets/employees soft-deleted
SELECT 'customers' AS entity, c.company_id, c.id, c.deleted_at
FROM public.customers c
WHERE c.deleted_at IS NOT NULL
UNION ALL
SELECT 'pets', p.company_id, p.id, p.deleted_at
FROM public.pets p
WHERE p.deleted_at IS NOT NULL
UNION ALL
SELECT 'employees', e.company_id, e.id, e.deleted_at
FROM public.employees e
WHERE e.deleted_at IS NOT NULL;

-- 8. sale_items de vendas válidas vs total da sale (reconciliação analítica)
SELECT
  s.company_id,
  s.id AS sale_id,
  s.status,
  s.total_cents,
  coalesce(sum(si.total_cents), 0) AS items_total_cents
FROM public.sales s
LEFT JOIN public.sale_items si
  ON si.sale_id = s.id AND si.company_id = s.company_id
WHERE s.status IN ('completed', 'partially_paid')
GROUP BY s.company_id, s.id
HAVING s.total_cents IS DISTINCT FROM coalesce(sum(si.total_cents), 0);
