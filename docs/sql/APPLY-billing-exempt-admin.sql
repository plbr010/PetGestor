-- PetGestor — empresas isentas de cobrança (conta admin da plataforma)
-- + assinatura forçada como active para essas empresas.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.billing_exempt IS
  'Quando true, a empresa tem acesso operacional permanente (conta admin da plataforma). Sem cobrança.';

CREATE INDEX IF NOT EXISTS idx_companies_billing_exempt
  ON public.companies (billing_exempt)
  WHERE billing_exempt = true;

-- Marca empresas cujo owner está na allowlist / platform_admins
UPDATE public.companies c
SET billing_exempt = true
WHERE c.billing_exempt = false
  AND EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN auth.users u ON u.id = cm.user_id
    WHERE cm.company_id = c.id
      AND cm.role = 'owner'
      AND cm.access_revoked_at IS NULL
      AND (
        lower(u.email) = 'plbrpc@gmail.com'
        OR EXISTS (
          SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = u.id
        )
      )
  );

-- Assinatura sempre "active" para empresas isentas
UPDATE public.company_subscriptions cs
SET
  status = 'active',
  subscribed_at = coalesce(cs.subscribed_at, now()),
  cancelled_at = NULL,
  cancel_at_period_end = false,
  current_period_start = coalesce(cs.current_period_start, now()),
  current_period_end = '2999-12-31T23:59:59.000Z'::timestamptz,
  next_payment_at = NULL,
  updated_at = now()
WHERE cs.company_id IN (
  SELECT id FROM public.companies WHERE billing_exempt = true
);

-- Novas empresas criadas por platform admin → isentas + assinatura active
CREATE OR REPLACE FUNCTION private.apply_billing_exempt_for_platform_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_email text;
  v_is_admin boolean := false;
BEGIN
  SELECT lower(u.email)
  INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.created_by;

  IF v_email = 'plbrpc@gmail.com' THEN
    v_is_admin := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = NEW.created_by
  ) THEN
    v_is_admin := true;
  END IF;

  IF v_is_admin THEN
    NEW.billing_exempt := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_billing_exempt_platform_admin ON public.companies;
CREATE TRIGGER companies_billing_exempt_platform_admin
  BEFORE INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION private.apply_billing_exempt_for_platform_admin();

-- Após criar subscription da empresa, se isenta → active permanente
CREATE OR REPLACE FUNCTION private.ensure_exempt_subscription_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
SET row_security = off
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = NEW.company_id AND c.billing_exempt = true
  ) THEN
    NEW.status := 'active';
    NEW.subscribed_at := coalesce(NEW.subscribed_at, now());
    NEW.cancelled_at := NULL;
    NEW.cancel_at_period_end := false;
    NEW.current_period_start := coalesce(NEW.current_period_start, now());
    NEW.current_period_end := '2999-12-31T23:59:59.000Z'::timestamptz;
    NEW.next_payment_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_subscriptions_exempt_active ON public.company_subscriptions;
CREATE TRIGGER company_subscriptions_exempt_active
  BEFORE INSERT OR UPDATE ON public.company_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION private.ensure_exempt_subscription_active();
