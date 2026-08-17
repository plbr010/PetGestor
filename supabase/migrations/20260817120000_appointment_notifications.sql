-- PetGestor — fila interna de confirmações e lembretes de agendamento
-- Sem envio externo nesta etapa (WhatsApp conectado depois).

-- ---------------------------------------------------------------------------
-- company_notification_settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_notification_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  appointment_confirmation_enabled boolean NOT NULL DEFAULT true,
  reminder_24h_enabled boolean NOT NULL DEFAULT true,
  reminder_2h_enabled boolean NOT NULL DEFAULT true,
  pet_ready_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS company_notification_settings_set_updated_at
  ON public.company_notification_settings;
CREATE TRIGGER company_notification_settings_set_updated_at
  BEFORE UPDATE ON public.company_notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.company_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_notification_settings_select_member
  ON public.company_notification_settings;
CREATE POLICY company_notification_settings_select_member
  ON public.company_notification_settings
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS company_notification_settings_insert_member
  ON public.company_notification_settings;
CREATE POLICY company_notification_settings_insert_member
  ON public.company_notification_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS company_notification_settings_update_member
  ON public.company_notification_settings;
CREATE POLICY company_notification_settings_update_member
  ON public.company_notification_settings
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP TRIGGER IF EXISTS company_notification_settings_prevent_company_change
  ON public.company_notification_settings;
CREATE TRIGGER company_notification_settings_prevent_company_change
  BEFORE UPDATE ON public.company_notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

GRANT SELECT, INSERT, UPDATE ON public.company_notification_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- notification_queue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  pet_id uuid NOT NULL,
  appointment_id uuid REFERENCES public.appointments (id) ON DELETE SET NULL,
  service_order_id uuid REFERENCES public.service_orders (id) ON DELETE SET NULL,
  type text NOT NULL,
  destination_phone text NOT NULL,
  message_body text NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_queue_type_check CHECK (
    type IN (
      'appointment_confirmation',
      'appointment_reminder_24h',
      'appointment_reminder_2h',
      'pet_ready'
    )
  ),
  CONSTRAINT notification_queue_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')
  ),
  CONSTRAINT notification_queue_attempts_check CHECK (attempts >= 0),
  CONSTRAINT notification_queue_destination_phone_length CHECK (
    char_length(destination_phone) >= 8
    AND char_length(destination_phone) <= 20
  ),
  CONSTRAINT notification_queue_message_body_length CHECK (
    char_length(message_body) >= 1
    AND char_length(message_body) <= 2000
  ),
  CONSTRAINT notification_queue_last_error_length CHECK (
    last_error IS NULL
    OR char_length(last_error) <= 500
  ),
  CONSTRAINT notification_queue_customer_company_fkey
    FOREIGN KEY (customer_id, company_id)
    REFERENCES public.customers (id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT notification_queue_pet_customer_company_fkey
    FOREIGN KEY (pet_id, customer_id, company_id)
    REFERENCES public.pets (id, customer_id, company_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS notification_queue_company_scheduled_idx
  ON public.notification_queue (company_id, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS notification_queue_appointment_idx
  ON public.notification_queue (company_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_queue_service_order_idx
  ON public.notification_queue (company_id, service_order_id)
  WHERE service_order_id IS NOT NULL;

-- Idempotência: uma notificação ativa por tipo/agendamento
CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_appointment_type_active_uidx
  ON public.notification_queue (company_id, appointment_id, type)
  WHERE appointment_id IS NOT NULL
    AND status IN ('pending', 'processing');

-- Idempotência: um aviso pet_ready ativo ou enviado por atendimento
CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_pet_ready_service_order_uidx
  ON public.notification_queue (company_id, service_order_id)
  WHERE service_order_id IS NOT NULL
    AND type = 'pet_ready'
    AND status IN ('pending', 'processing', 'sent');

DROP TRIGGER IF EXISTS notification_queue_set_updated_at ON public.notification_queue;
CREATE TRIGGER notification_queue_set_updated_at
  BEFORE UPDATE ON public.notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_queue_select_member ON public.notification_queue;
CREATE POLICY notification_queue_select_member
  ON public.notification_queue
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS notification_queue_insert_member ON public.notification_queue;
CREATE POLICY notification_queue_insert_member
  ON public.notification_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS notification_queue_update_member ON public.notification_queue;
CREATE POLICY notification_queue_update_member
  ON public.notification_queue
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP TRIGGER IF EXISTS notification_queue_prevent_company_change ON public.notification_queue;
CREATE TRIGGER notification_queue_prevent_company_change
  BEFORE UPDATE ON public.notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

GRANT SELECT, INSERT, UPDATE ON public.notification_queue TO authenticated;

COMMENT ON TABLE public.company_notification_settings IS
  'Preferências de mensagens automáticas por empresa (envio externo futuro).';

COMMENT ON TABLE public.notification_queue IS
  'Fila interna de notificações ao tutor — confirmação, lembretes e pet pronto.';
