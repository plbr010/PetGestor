-- PetGestor BLOCO 4 — diagnóstico somente leitura de pacotes.
-- Não altera dados. Use no SQL Editor para reconciliação manual.
--
-- expires_at é INCLUSIVO: expirado quando expires_at < hoje civil da empresa.

-- 1. Pacotes pending ainda com status operacional active (esperado até o pagamento;
--    após o BLOCO 4 deixam de ser consumíveis mesmo assim).
SELECT
  csp.company_id,
  csp.id AS customer_package_id,
  csp.status AS package_status,
  fe.status AS financial_status,
  fe.amount_cents,
  csp.price_cents_snapshot,
  csp.expires_at
FROM public.customer_service_packages csp
LEFT JOIN public.financial_entries fe
  ON fe.customer_service_package_id = csp.id
 AND fe.company_id = csp.company_id
 AND fe.source_type = 'service_package'
 AND fe.deleted_at IS NULL
WHERE fe.status = 'pending'
  AND csp.status = 'active';

-- 2. Pacote cancelled com receita ainda paid (inconsistência histórica — não auto-corrigir).
SELECT
  csp.company_id,
  csp.id AS customer_package_id,
  csp.status AS package_status,
  fe.id AS financial_entry_id,
  fe.status AS financial_status,
  fe.amount_cents
FROM public.customer_service_packages csp
INNER JOIN public.financial_entries fe
  ON fe.customer_service_package_id = csp.id
 AND fe.company_id = csp.company_id
 AND fe.source_type = 'service_package'
 AND fe.deleted_at IS NULL
WHERE csp.status = 'cancelled'
  AND fe.status = 'paid';

-- 3. Pacote sem financial_entry canônica.
SELECT
  csp.company_id,
  csp.id AS customer_package_id,
  csp.status,
  csp.financial_entry_id,
  csp.price_cents_snapshot
FROM public.customer_service_packages csp
WHERE csp.financial_entry_id IS NULL
   OR NOT EXISTS (
     SELECT 1
     FROM public.financial_entries fe
     WHERE fe.customer_service_package_id = csp.id
       AND fe.company_id = csp.company_id
       AND fe.source_type = 'service_package'
       AND fe.deleted_at IS NULL
   );

-- 4. Receita de pacote sem pacote correspondente.
SELECT
  fe.company_id,
  fe.id AS financial_entry_id,
  fe.customer_service_package_id,
  fe.status,
  fe.amount_cents
FROM public.financial_entries fe
WHERE fe.source_type = 'service_package'
  AND fe.deleted_at IS NULL
  AND (
    fe.customer_service_package_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.customer_service_packages csp
      WHERE csp.id = fe.customer_service_package_id
        AND csp.company_id = fe.company_id
    )
  );

-- 5. Divergência de valor entre snapshot e receita.
SELECT
  csp.company_id,
  csp.id AS customer_package_id,
  csp.price_cents_snapshot,
  fe.amount_cents,
  fe.status
FROM public.customer_service_packages csp
INNER JOIN public.financial_entries fe
  ON fe.customer_service_package_id = csp.id
 AND fe.company_id = csp.company_id
 AND fe.source_type = 'service_package'
 AND fe.deleted_at IS NULL
WHERE fe.amount_cents IS DISTINCT FROM csp.price_cents_snapshot;

-- 6. Saldo negativo (o CHECK atual deveria impedir; listar se existir).
SELECT
  cspi.company_id,
  cspi.customer_package_id,
  cspi.service_id,
  cspi.quantity_total,
  cspi.quantity_used
FROM public.customer_service_package_items cspi
WHERE cspi.quantity_used > cspi.quantity_total
   OR cspi.quantity_used < 0;

-- 7. Pacote operacionalmente active já vencido na data civil da empresa.
SELECT
  csp.company_id,
  csp.id AS customer_package_id,
  csp.status,
  csp.expires_at,
  (timezone(COALESCE(c.timezone, 'America/Sao_Paulo'), now()))::date AS company_today
FROM public.customer_service_packages csp
INNER JOIN public.companies c ON c.id = csp.company_id
WHERE csp.status = 'active'
  AND csp.expires_at < (timezone(COALESCE(c.timezone, 'America/Sao_Paulo'), now()))::date;

-- 8. Duplicidade potencial de receita por pacote.
SELECT
  company_id,
  customer_service_package_id,
  COUNT(*) AS entries
FROM public.financial_entries
WHERE source_type = 'service_package'
  AND customer_service_package_id IS NOT NULL
  AND deleted_at IS NULL
GROUP BY company_id, customer_service_package_id
HAVING COUNT(*) > 1;
