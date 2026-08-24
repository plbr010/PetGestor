-- PetGestor — aplicar no SQL Editor do Supabase (produção)
-- Plano anual: colunas billing_interval + offer_code
-- Seguro rodar mais de uma vez (IF NOT EXISTS).

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly';

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS offer_code text;

ALTER TABLE public.company_subscriptions
  DROP CONSTRAINT IF EXISTS company_subscriptions_billing_interval_check;

ALTER TABLE public.company_subscriptions
  ADD CONSTRAINT company_subscriptions_billing_interval_check
  CHECK (billing_interval IN ('monthly', 'annual'));

UPDATE public.company_subscriptions
SET billing_interval = 'monthly'
WHERE billing_interval IS NULL
   OR billing_interval NOT IN ('monthly', 'annual');
