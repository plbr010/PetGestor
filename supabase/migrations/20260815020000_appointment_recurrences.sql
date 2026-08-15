-- PetGestor — recorrência de agendamentos (etapa 1)
-- Cada ocorrência continua sendo um appointment normal.
-- company_id sempre derivado do membro autenticado (RLS + triggers).

CREATE TABLE IF NOT EXISTS public.appointment_recurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  source_appointment_id uuid REFERENCES public.appointments (id) ON DELETE SET NULL,
  frequency text NOT NULL
    CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'custom_days')),
  interval_value integer NOT NULL DEFAULT 1
    CHECK (interval_value >= 1 AND interval_value <= 365),
  ends_at date,
  max_occurrences integer
    CHECK (max_occurrences IS NULL OR (max_occurrences >= 2 AND max_occurrences <= 52)),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_recurrences_end_rule_check
    CHECK (ends_at IS NOT NULL OR max_occurrences IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS appointment_recurrences_company_idx
  ON public.appointment_recurrences (company_id)
  WHERE active = true;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS recurrence_id uuid;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS recurrence_index integer
    CHECK (recurrence_index IS NULL OR recurrence_index >= 1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_recurrence_id_fkey'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_recurrence_id_fkey
      FOREIGN KEY (recurrence_id)
      REFERENCES public.appointment_recurrences (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS appointments_recurrence_id_idx
  ON public.appointments (company_id, recurrence_id, scheduled_start)
  WHERE recurrence_id IS NOT NULL AND deleted_at IS NULL;

-- FK source_appointment após appointments.recurrence_id existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointment_recurrences_source_appointment_id_fkey'
  ) THEN
    -- already declared inline; keep noop for idempotency
    NULL;
  END IF;
END $$;

DROP TRIGGER IF EXISTS appointment_recurrences_set_updated_at ON public.appointment_recurrences;
CREATE TRIGGER appointment_recurrences_set_updated_at
  BEFORE UPDATE ON public.appointment_recurrences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.appointment_recurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_recurrences_select_member ON public.appointment_recurrences;
CREATE POLICY appointment_recurrences_select_member
  ON public.appointment_recurrences
  FOR SELECT
  TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS appointment_recurrences_insert_member ON public.appointment_recurrences;
CREATE POLICY appointment_recurrences_insert_member
  ON public.appointment_recurrences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_company_member(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS appointment_recurrences_update_member ON public.appointment_recurrences;
CREATE POLICY appointment_recurrences_update_member
  ON public.appointment_recurrences
  FOR UPDATE
  TO authenticated
  USING (private.is_company_member(company_id))
  WITH CHECK (private.is_company_member(company_id));

DROP TRIGGER IF EXISTS appointment_recurrences_prevent_company_change ON public.appointment_recurrences;
CREATE TRIGGER appointment_recurrences_prevent_company_change
  BEFORE UPDATE ON public.appointment_recurrences
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

GRANT SELECT, INSERT, UPDATE ON public.appointment_recurrences TO authenticated;

COMMENT ON TABLE public.appointment_recurrences IS
  'Regras de recorrência de agendamentos. Ocorrências ficam em appointments.';

COMMENT ON COLUMN public.appointments.recurrence_id IS
  'Série de recorrência (NULL = agendamento único).';

COMMENT ON COLUMN public.appointments.recurrence_index IS
  'Índice 1-based da ocorrência na série.';
