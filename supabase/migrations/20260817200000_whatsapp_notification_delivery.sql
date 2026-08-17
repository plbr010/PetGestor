-- PetGestor — WhatsApp Cloud API: rastreio, retry e claim da fila
-- Não envia mensagens; apenas estrutura de processamento.

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'whatsapp';

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS provider_message_id text;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS provider_error_code text;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS provider_error_message text;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 4;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_status_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_status_check CHECK (
    status IN (
      'pending',
      'processing',
      'sent',
      'failed',
      'cancelled',
      'simulated'
    )
  );

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_max_attempts_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_max_attempts_check CHECK (
    max_attempts >= 1 AND max_attempts <= 10
  );

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_provider_error_code_length;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_provider_error_code_length CHECK (
    provider_error_code IS NULL OR char_length(provider_error_code) <= 40
  );

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_provider_error_message_length;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_provider_error_message_length CHECK (
    provider_error_message IS NULL OR char_length(provider_error_message) <= 500
  );

CREATE INDEX IF NOT EXISTS notification_queue_due_claim_idx
  ON public.notification_queue (status, scheduled_for, next_attempt_at)
  WHERE status IN ('pending', 'processing');

CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_provider_message_id_uidx
  ON public.notification_queue (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Claim atômico para workers (service_role). SKIP LOCKED evita envio duplicado.
CREATE OR REPLACE FUNCTION public.claim_due_notifications(
  p_limit integer DEFAULT 25,
  p_now timestamptz DEFAULT now()
)
RETURNS SETOF public.notification_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
BEGIN
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 25), 50));

  RETURN QUERY
  UPDATE public.notification_queue AS nq
  SET
    status = 'processing',
    claimed_at = p_now,
    attempts = nq.attempts + 1,
    updated_at = p_now
  WHERE nq.id IN (
    SELECT q.id
    FROM public.notification_queue AS q
    WHERE (
        q.status = 'pending'
        AND q.scheduled_for <= p_now
        AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= p_now)
      )
      OR (
        q.status = 'processing'
        AND q.claimed_at IS NOT NULL
        AND q.claimed_at <= p_now - interval '10 minutes'
        AND q.attempts < q.max_attempts
      )
    ORDER BY q.scheduled_for ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  )
  RETURNING nq.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_notifications(integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_notifications(integer, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_notifications(integer, timestamptz) TO service_role;

COMMENT ON FUNCTION public.claim_due_notifications(integer, timestamptz) IS
  'Reserva lote de notificações vencidas para o worker WhatsApp. Somente service_role.';
