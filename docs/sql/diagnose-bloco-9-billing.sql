-- PetGestor BLOCO 9 — diagnóstico SOMENTE LEITURA.
-- Assinaturas, trial, pagamentos Mercado Pago, webhooks.
-- Não altera dados. Não faz autofix.

-- 1. Duas assinaturas ativas da mesma empresa (não deveria: PK company_id)
SELECT
  cs.company_id,
  count(*) AS subscription_rows
FROM public.company_subscriptions cs
GROUP BY cs.company_id
HAVING count(*) > 1;

-- 2. Payment id duplicado
SELECT
  bp.provider,
  bp.provider_payment_id,
  count(*) AS payment_rows,
  array_agg(bp.company_id) AS company_ids
FROM public.billing_payments bp
GROUP BY bp.provider, bp.provider_payment_id
HAVING count(*) > 1;

-- 3. Status active sem período pago válido (agora)
SELECT
  cs.company_id,
  cs.status,
  cs.current_period_end,
  cs.subscribed_at,
  cs.last_payment_status
FROM public.company_subscriptions cs
WHERE cs.status = 'active'
  AND (cs.current_period_end IS NULL OR cs.current_period_end <= now());

-- 4. Trial duplicado (mesmo critério: mais de uma row por empresa)
SELECT
  cs.company_id,
  count(*) AS trial_rows
FROM public.company_subscriptions cs
WHERE cs.status = 'trialing'
GROUP BY cs.company_id
HAVING count(*) > 1;

-- 5. Trial vencido ainda persistido como trialing (acesso só se o app ignorar o relógio)
SELECT
  cs.company_id,
  cs.status,
  cs.trial_started_at,
  cs.trial_ends_at
FROM public.company_subscriptions cs
WHERE cs.status = 'trialing'
  AND cs.trial_ends_at <= now();

-- 6. Cancelled com período já encerrado (acesso residual indevido se o app olhar só o status)
SELECT
  cs.company_id,
  cs.status,
  cs.cancel_at_period_end,
  cs.current_period_end,
  cs.cancelled_at
FROM public.company_subscriptions cs
WHERE cs.status = 'cancelled'
  AND cs.current_period_end IS NOT NULL
  AND cs.current_period_end <= now();

-- 7. Amount divergente do plano canônico (mensal 8990 / anual 79900 centavos)
SELECT
  bp.company_id,
  bp.provider_payment_id,
  bp.amount_cents,
  bp.currency,
  cs.billing_interval,
  cs.plan_code
FROM public.billing_payments bp
JOIN public.company_subscriptions cs ON cs.company_id = bp.company_id
WHERE bp.amount_cents IS NOT NULL
  AND (
    (coalesce(cs.billing_interval, 'monthly') = 'monthly' AND bp.amount_cents <> 8990)
    OR (cs.billing_interval = 'annual' AND bp.amount_cents <> 79900)
    OR (bp.currency IS NOT NULL AND upper(bp.currency) <> 'BRL')
  );

-- 8. Subscription sem company
SELECT
  cs.company_id,
  cs.status
FROM public.company_subscriptions cs
LEFT JOIN public.companies c ON c.id = cs.company_id
WHERE c.id IS NULL;

-- 9. Evento de webhook duplicado
SELECT
  e.provider,
  e.provider_event_id,
  count(*) AS event_rows
FROM public.billing_webhook_events e
GROUP BY e.provider, e.provider_event_id
HAVING count(*) > 1;

-- 10. Provider subscription id apontando para mais de uma empresa
SELECT
  cs.provider_subscription_id,
  count(*) AS companies,
  array_agg(cs.company_id) AS company_ids
FROM public.company_subscriptions cs
WHERE cs.provider_subscription_id IS NOT NULL
GROUP BY cs.provider_subscription_id
HAVING count(*) > 1;
