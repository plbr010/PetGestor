-- PetGestor — aplicar no SQL Editor do Supabase
-- Central de notificações internas (sino). Idempotente.

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  entity_type text,
  entity_id uuid,
  href text,
  required_permission text,
  dedupe_key text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT app_notifications_type_length CHECK (
    char_length(type) >= 2 AND char_length(type) <= 64
  ),
  CONSTRAINT app_notifications_severity_check CHECK (
    severity IN ('info', 'success', 'warning', 'error')
  ),
  CONSTRAINT app_notifications_title_length CHECK (
    char_length(title) >= 1 AND char_length(title) <= 160
  ),
  CONSTRAINT app_notifications_message_length CHECK (
    char_length(message) >= 1 AND char_length(message) <= 500
  ),
  CONSTRAINT app_notifications_href_length CHECK (
    href IS NULL OR char_length(href) <= 300
  ),
  CONSTRAINT app_notifications_dedupe_length CHECK (
    char_length(dedupe_key) >= 2 AND char_length(dedupe_key) <= 200
  ),
  CONSTRAINT app_notifications_entity_type_length CHECK (
    entity_type IS NULL
    OR (char_length(entity_type) >= 2 AND char_length(entity_type) <= 64)
  ),
  CONSTRAINT app_notifications_required_permission_length CHECK (
    required_permission IS NULL
    OR (char_length(required_permission) >= 2 AND char_length(required_permission) <= 64)
  ),
  CONSTRAINT app_notifications_read_consistency CHECK (
    (is_read = false AND read_at IS NULL)
    OR (is_read = true AND read_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS app_notifications_company_dedupe_uidx
  ON public.app_notifications (company_id, dedupe_key);

CREATE INDEX IF NOT EXISTS app_notifications_company_user_created_idx
  ON public.app_notifications (company_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_notifications_company_unread_idx
  ON public.app_notifications (company_id, created_at DESC)
  WHERE is_read = false;

DROP TRIGGER IF EXISTS app_notifications_prevent_company_change
  ON public.app_notifications;
CREATE TRIGGER app_notifications_prevent_company_change
  BEFORE UPDATE ON public.app_notifications
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_company_change();

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_notifications_select_member ON public.app_notifications;
CREATE POLICY app_notifications_select_member
  ON public.app_notifications
  FOR SELECT
  TO authenticated
  USING (
    private.is_company_member(company_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS app_notifications_insert_member ON public.app_notifications;
CREATE POLICY app_notifications_insert_member
  ON public.app_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS app_notifications_update_member ON public.app_notifications;
CREATE POLICY app_notifications_update_member
  ON public.app_notifications
  FOR UPDATE
  TO authenticated
  USING (
    private.is_company_member(company_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  )
  WITH CHECK (
    private.is_company_member(company_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE ON public.app_notifications TO authenticated;
