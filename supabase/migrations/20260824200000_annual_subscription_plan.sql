-- PetGestor — plano anual (billing_interval + offer_code)
-- Não altera o plano mensal existente; linhas atuais ficam monthly.

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly';

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS offer_code text;

ALTER TABLE public.company_subscriptions
  DROP CONSTRAINT IF EXISTS company_subscriptions_billing_interval_check;

ALTER TABLE public.company_subscriptions
  ADD CONSTRAINT company_subscriptions_billing_interval_check
  CHECK (billing_interval IN ('monthly', 'annual'));

COMMENT ON COLUMN public.company_subscriptions.billing_interval IS
  'monthly = R$89,90/mês; annual = R$799/ano (preapproval MP frequency 12 months).';

COMMENT ON COLUMN public.company_subscriptions.offer_code IS
  'Código de oferta comercial (ex.: annual_launch_799). Sem contagem regressiva falsa.';

-- Backfill seguro: tudo que já existe é mensal
UPDATE public.company_subscriptions
SET billing_interval = 'monthly'
WHERE billing_interval IS NULL
   OR billing_interval NOT IN ('monthly', 'annual');

-- plan_code anual permitido (mensal permanece o default do trigger de trial)
-- Sem CHECK rígido em plan_code para não quebrar dados legados.
