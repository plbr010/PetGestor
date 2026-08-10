-- PetGestor — Etapa 10B: Mercado Pago billing
-- MIGRATION PENDENTE — aplicar manualmente no Supabase SQL Editor

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_checkout_url text,
  ADD COLUMN IF NOT EXISTS checkout_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_status text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS company_subscriptions_provider_subscription_id_idx
  ON public.company_subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'mercado_pago',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  action text,
  resource_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'received',
  error_message text,
  CONSTRAINT billing_webhook_events_processing_status_check CHECK (
    processing_status IN ('received', 'processed', 'failed', 'ignored')
  ),
  CONSTRAINT billing_webhook_events_provider_event_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS billing_webhook_events_resource_id_idx
  ON public.billing_webhook_events (resource_id);

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

-- Sem policies para authenticated — apenas backend privilegiado manipula.
