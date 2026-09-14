-- PetGestor BLOCO 9 — billing: payment id único, ordering e idempotência de checkout
-- Incremental. Não edita 20260806083000 / 20260806084500 / 20260824200000.

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz;

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key text;

COMMENT ON COLUMN public.company_subscriptions.provider_updated_at IS
  'Timestamp do recurso no Mercado Pago (last_modified/date_last_updated). Evento mais antigo não regride status local.';

COMMENT ON COLUMN public.company_subscriptions.checkout_idempotency_key IS
  'X-Idempotency-Key server-side do POST /preapproval. Duplo clique/retry reutilizam a mesma operação.';

CREATE TABLE IF NOT EXISTS public.billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mercado_pago',
  provider_payment_id text NOT NULL,
  provider_subscription_id text,
  status text NOT NULL,
  amount_cents integer,
  currency text,
  provider_updated_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_payments_provider_payment_unique UNIQUE (provider, provider_payment_id)
);

COMMENT ON TABLE public.billing_payments IS
  'Pagamentos SaaS do provider. UNIQUE (provider, provider_payment_id): replay/concorrência = uma linha lógica. Sem policies para authenticated.';

CREATE INDEX IF NOT EXISTS billing_payments_company_id_idx
  ON public.billing_payments (company_id);

CREATE INDEX IF NOT EXISTS billing_payments_provider_subscription_id_idx
  ON public.billing_payments (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

DROP TRIGGER IF EXISTS billing_payments_set_updated_at ON public.billing_payments;
CREATE TRIGGER billing_payments_set_updated_at
  BEFORE UPDATE ON public.billing_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;

-- Sem CREATE POLICY para authenticated/anon: mutações e leituras privilegiadas só no backend/webhook.
