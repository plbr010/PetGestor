-- PetGestor BLOCO 5 — diagnóstico somente leitura do financeiro.
-- Não altera dados. Use no SQL Editor para reconciliação manual.
--
-- Fonte de verdade:
--   recebido = SUM(financial_payments.amount_cents WHERE cancelled_at IS NULL)
--   legado: status=paid sem parcela ativa conta amount_cents (não inventar linhas)

-- 1. paid sem financial_payment ativo
SELECT
  fe.company_id,
  fe.id AS financial_entry_id,
  fe.source_type,
  fe.status,
  fe.amount_cents,
  fe.payment_method,
  fe.paid_at
FROM public.financial_entries fe
WHERE fe.deleted_at IS NULL
  AND fe.status = 'paid'
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_payments fp
    WHERE fp.financial_entry_id = fe.id
      AND fp.company_id = fe.company_id
      AND fp.cancelled_at IS NULL
  );

-- 2. partially_paid com soma incoerente (0 ou >= amount)
SELECT
  fe.company_id,
  fe.id AS financial_entry_id,
  fe.amount_cents,
  COALESCE(SUM(fp.amount_cents) FILTER (WHERE fp.cancelled_at IS NULL), 0) AS received_cents
FROM public.financial_entries fe
LEFT JOIN public.financial_payments fp
  ON fp.financial_entry_id = fe.id
 AND fp.company_id = fe.company_id
WHERE fe.deleted_at IS NULL
  AND fe.status = 'partially_paid'
GROUP BY fe.company_id, fe.id, fe.amount_cents
HAVING COALESCE(SUM(fp.amount_cents) FILTER (WHERE fp.cancelled_at IS NULL), 0) <= 0
    OR COALESCE(SUM(fp.amount_cents) FILTER (WHERE fp.cancelled_at IS NULL), 0) >= fe.amount_cents;

-- 3. soma de pagamentos ativos > amount_cents
SELECT
  fe.company_id,
  fe.id AS financial_entry_id,
  fe.amount_cents,
  SUM(fp.amount_cents) AS received_cents
FROM public.financial_entries fe
INNER JOIN public.financial_payments fp
  ON fp.financial_entry_id = fe.id
 AND fp.company_id = fe.company_id
 AND fp.cancelled_at IS NULL
WHERE fe.deleted_at IS NULL
GROUP BY fe.company_id, fe.id, fe.amount_cents
HAVING SUM(fp.amount_cents) > fe.amount_cents;

-- 4. pending com pagamentos ativos
SELECT
  fe.company_id,
  fe.id AS financial_entry_id,
  fe.status,
  fe.amount_cents,
  SUM(fp.amount_cents) AS received_cents
FROM public.financial_entries fe
INNER JOIN public.financial_payments fp
  ON fp.financial_entry_id = fe.id
 AND fp.company_id = fe.company_id
 AND fp.cancelled_at IS NULL
WHERE fe.deleted_at IS NULL
  AND fe.status = 'pending'
GROUP BY fe.company_id, fe.id, fe.status, fe.amount_cents;

-- 5. cancelled com pagamentos ativos
SELECT
  fe.company_id,
  fe.id AS financial_entry_id,
  fe.status,
  fe.amount_cents,
  SUM(fp.amount_cents) AS received_cents
FROM public.financial_entries fe
INNER JOIN public.financial_payments fp
  ON fp.financial_entry_id = fe.id
 AND fp.company_id = fe.company_id
 AND fp.cancelled_at IS NULL
WHERE fe.deleted_at IS NULL
  AND fe.status = 'cancelled'
GROUP BY fe.company_id, fe.id, fe.status, fe.amount_cents;

-- 6. payment_method da entry divergente dos pagamentos ativos
SELECT
  fe.company_id,
  fe.id AS financial_entry_id,
  fe.payment_method AS entry_method,
  ARRAY_AGG(DISTINCT fp.payment_method) AS payment_methods
FROM public.financial_entries fe
INNER JOIN public.financial_payments fp
  ON fp.financial_entry_id = fe.id
 AND fp.company_id = fe.company_id
 AND fp.cancelled_at IS NULL
WHERE fe.deleted_at IS NULL
  AND fe.payment_method IS NOT NULL
GROUP BY fe.company_id, fe.id, fe.payment_method
HAVING NOT (fe.payment_method = ANY (ARRAY_AGG(DISTINCT fp.payment_method)));

-- 7. origem automática com status inconsistente
-- OS: deve existir no máximo uma receita ativa por atendimento
SELECT
  fe.company_id,
  fe.service_order_id,
  COUNT(*) AS entry_count
FROM public.financial_entries fe
WHERE fe.source_type = 'service_order'
  AND fe.deleted_at IS NULL
  AND fe.service_order_id IS NOT NULL
GROUP BY fe.company_id, fe.service_order_id
HAVING COUNT(*) > 1;

-- Pacote: receita paid vs pacote não ativo/crédito, ou pending com consumo
SELECT
  csp.company_id,
  csp.id AS customer_package_id,
  csp.status AS package_status,
  fe.id AS financial_entry_id,
  fe.status AS financial_status
FROM public.customer_service_packages csp
INNER JOIN public.financial_entries fe
  ON fe.customer_service_package_id = csp.id
 AND fe.company_id = csp.company_id
 AND fe.source_type = 'service_package'
 AND fe.deleted_at IS NULL
WHERE (fe.status = 'paid' AND csp.status = 'cancelled')
   OR (fe.status = 'pending' AND EXISTS (
        SELECT 1
        FROM public.customer_service_package_usages u
        WHERE u.customer_package_id = csp.id
          AND u.company_id = csp.company_id
          AND u.reversed_at IS NULL
      ));
