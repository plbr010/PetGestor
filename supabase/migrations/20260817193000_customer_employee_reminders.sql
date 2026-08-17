-- PetGestor — lembretes internos de agendamento para tutor e funcionário
-- Reutiliza company_notification_settings + notification_queue.
-- Sem envio externo nesta etapa.

-- ---------------------------------------------------------------------------
-- Settings: lembrete do dia + equipe
-- ---------------------------------------------------------------------------

ALTER TABLE public.company_notification_settings
  ADD COLUMN IF NOT EXISTS customer_same_day_reminder_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.company_notification_settings
  ADD COLUMN IF NOT EXISTS employee_same_day_reminder_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.company_notification_settings
  ADD COLUMN IF NOT EXISTS employee_reminder_2h_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.company_notification_settings
  ADD COLUMN IF NOT EXISTS same_day_reminder_time time NOT NULL DEFAULT '08:00';

ALTER TABLE public.company_notification_settings
  DROP CONSTRAINT IF EXISTS company_notification_settings_same_day_time_check;

ALTER TABLE public.company_notification_settings
  ADD CONSTRAINT company_notification_settings_same_day_time_check CHECK (
    same_day_reminder_time >= time '00:00'
    AND same_day_reminder_time <= time '23:59'
  );

-- ---------------------------------------------------------------------------
-- Queue: destinatário (tutor x funcionário)
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'customer';

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS employee_id uuid;

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_recipient_type_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_recipient_type_check CHECK (
    recipient_type IN ('customer', 'employee')
  );

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_employee_recipient_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_employee_recipient_check CHECK (
    (recipient_type = 'customer' AND employee_id IS NULL)
    OR (recipient_type = 'employee' AND employee_id IS NOT NULL)
  );

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_employee_company_fkey;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees (id, company_id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS notification_queue_employee_idx
  ON public.notification_queue (company_id, employee_id)
  WHERE employee_id IS NOT NULL;

-- Novos tipos (reutiliza appointment_reminder_2h e pet_ready do tutor)
ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_type_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_type_check CHECK (
    type IN (
      'appointment_confirmation',
      'appointment_reminder_24h',
      'appointment_reminder_2h',
      'customer_same_day_reminder',
      'pet_ready',
      'employee_same_day_reminder',
      'employee_2h_reminder'
    )
  );

COMMENT ON COLUMN public.company_notification_settings.same_day_reminder_time IS
  'Horário local da empresa para o lembrete do dia (padrão 08:00).';

COMMENT ON COLUMN public.notification_queue.recipient_type IS
  'Destinatário interno: customer (tutor) ou employee (funcionário).';
