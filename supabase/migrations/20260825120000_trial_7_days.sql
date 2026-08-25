-- PetGestor — trial gratuito: 3 dias (72h) → 7 dias (168h)
-- Aplica somente a NOVAS empresas (trigger create_company_subscription).
-- NÃO altera trial_ends_at de registros já existentes (ativos, expirados ou assinantes).

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
    now() + interval '7 days'
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.create_company_subscription() IS
  'Cria company_subscriptions em trialing com trial de 7 dias (168h) a partir de now(). Idempotente via ON CONFLICT DO NOTHING.';
