-- Diagnóstico SOMENTE LEITURA — BLOCO 8.1 (serviço / preços / ficha).
-- Não altera dados. Não é autofix.

-- 1. Receitas cujo produto não pertence à mesma empresa
SELECT
  r.company_id,
  r.service_id,
  r.product_id,
  r.quantity,
  'product_cross_tenant_or_missing' AS issue
FROM public.service_product_recipes r
LEFT JOIN public.products p
  ON p.id = r.product_id
 AND p.company_id = r.company_id
WHERE p.id IS NULL;

-- 2. Receitas apontando para produto arquivado
SELECT
  r.company_id,
  r.service_id,
  r.product_id,
  p.archived_at,
  'product_archived' AS issue
FROM public.service_product_recipes r
JOIN public.products p
  ON p.id = r.product_id
 AND p.company_id = r.company_id
WHERE p.archived_at IS NOT NULL;

-- 3. Quantidade inválida (o CHECK atual impede <= 0; lista residual)
SELECT
  r.company_id,
  r.service_id,
  r.product_id,
  r.quantity,
  'invalid_quantity' AS issue
FROM public.service_product_recipes r
WHERE r.quantity IS NULL OR r.quantity <= 0;

-- 4. Serviço fixed com faixas de porte órfãs
SELECT
  s.company_id,
  s.id AS service_id,
  s.pricing_mode,
  sp.size,
  'fixed_with_size_price' AS issue
FROM public.services s
JOIN public.service_size_prices sp
  ON sp.service_id = s.id
 AND sp.company_id = s.company_id
WHERE s.deleted_at IS NULL
  AND s.pricing_mode = 'fixed';

-- 5. Serviço by_size sem as 4 faixas
SELECT
  s.company_id,
  s.id AS service_id,
  s.pricing_mode,
  count(sp.size) AS size_price_count,
  'by_size_missing_prices' AS issue
FROM public.services s
LEFT JOIN public.service_size_prices sp
  ON sp.service_id = s.id
 AND sp.company_id = s.company_id
WHERE s.deleted_at IS NULL
  AND s.pricing_mode = 'by_size'
GROUP BY s.company_id, s.id, s.pricing_mode
HAVING count(sp.size) <> 4;

-- 6. Receitas de serviço inexistente/arquivado
SELECT
  r.company_id,
  r.service_id,
  r.product_id,
  'recipe_without_live_service' AS issue
FROM public.service_product_recipes r
LEFT JOIN public.services s
  ON s.id = r.service_id
 AND s.company_id = r.company_id
 AND s.deleted_at IS NULL
WHERE s.id IS NULL;
