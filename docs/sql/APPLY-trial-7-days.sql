-- PetGestor — aplicar no SQL Editor do Supabase
-- Trial: 7 dias para NOVAS empresas apenas.
-- Não estende trials já criados.

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
