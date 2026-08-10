-- PetGestor — Etapa 10A: trial 72h e company_subscriptions
-- MIGRATION PENDENTE — aplicar manualmente no Supabase SQL Editor

-- ---------------------------------------------------------------------------
-- company_subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_subscriptions (
  company_id uuid PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  plan_code text NOT NULL DEFAULT 'petgestor_monthly',
  status text NOT NULL DEFAULT 'trialing',
  trial_started_at timestamptz NOT NULL,
  trial_ends_at timestamptz NOT NULL,
  provider text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_subscriptions_status_check CHECK (
    status IN ('trialing', 'active', 'past_due', 'cancelled')
  ),
  CONSTRAINT company_subscriptions_trial_window_check CHECK (
    trial_ends_at > trial_started_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS company_subscriptions_provider_subscription_id_key
  ON public.company_subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS company_subscriptions_status_idx
  ON public.company_subscriptions (status);

CREATE INDEX IF NOT EXISTS company_subscriptions_trial_ends_at_idx
  ON public.company_subscriptions (trial_ends_at);

DROP TRIGGER IF EXISTS company_subscriptions_set_updated_at ON public.company_subscriptions;
CREATE TRIGGER company_subscriptions_set_updated_at
  BEFORE UPDATE ON public.company_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Criação automática do trial (72 horas exatas)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.create_company_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  INSERT INTO public.company_subscriptions (
    company_id,
    plan_code,
    status,
    trial_started_at,
    trial_ends_at
  )
  VALUES (
    NEW.id,
    'petgestor_monthly',
    'trialing',
    now(),
    now() + interval '72 hours'
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_create_subscription ON public.companies;
CREATE TRIGGER companies_create_subscription
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION private.create_company_subscription();

-- ---------------------------------------------------------------------------
-- Backfill: empresas existentes sem subscription
-- trial_started_at = momento da migration; trial_ends_at = +72 horas
-- Não sobrescreve registros existentes.
-- ---------------------------------------------------------------------------

INSERT INTO public.company_subscriptions (
  company_id,
  plan_code,
  status,
  trial_started_at,
  trial_ends_at
)
SELECT
  c.id,
  'petgestor_monthly',
  'trialing',
  now(),
  now() + interval '72 hours'
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.company_subscriptions cs
  WHERE cs.company_id = c.id
);

-- ---------------------------------------------------------------------------
-- RLS — SELECT membros; sem mutações pelo browser
-- ---------------------------------------------------------------------------

ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_subscriptions_select ON public.company_subscriptions;
CREATE POLICY company_subscriptions_select ON public.company_subscriptions
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

-- INSERT/UPDATE/DELETE restritos ao backend / integrações futuras (sem policy para authenticated)
