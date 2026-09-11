-- PetGestor — BLOCO 1: autorização, membership revogada, tenant explícito, RLS e Storage
-- Incremental. Não dropa tabelas, não desabilita RLS, não apaga dados.

-- ---------------------------------------------------------------------------
-- 1. Membership ativa = user_id = auth.uid() AND access_revoked_at IS NULL
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND access_revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.has_company_role(p_company_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND access_revoked_at IS NULL
      AND role = ANY (p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION private.member_has_active_access(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.access_revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.is_company_owner_or_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.access_revoked_at IS NULL
      AND cm.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION private.profile_default_permissions(p_profile text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_profile
    WHEN 'owner_admin' THEN '[]'::jsonb
    WHEN 'manager' THEN '[
      "dashboard.view","customers.view","customers.create","customers.edit","customers.archive",
      "pets.view","pets.create","pets.edit",
      "appointments.view","appointments.create","appointments.edit","appointments.cancel",
      "service_orders.view","service_orders.update_status",
      "services.view","services.manage",
      "employees.view","employees.manage",
      "finance.view","finance.create","finance.edit",
      "inventory.view","inventory.manage","inventory.adjust",
      "pos.use","pos.apply_discount","pos.cancel_sale","pos.receive_payment","pos.close_cash",
      "reports.view","settings.view"
    ]'::jsonb
    WHEN 'reception' THEN '[
      "dashboard.view",
      "customers.view","customers.create","customers.edit",
      "pets.view","pets.create","pets.edit",
      "appointments.view","appointments.create","appointments.edit",
      "service_orders.view","service_orders.update_status",
      "services.view",
      "finance.create",
      "pos.use","pos.receive_payment"
    ]'::jsonb
    WHEN 'operational' THEN '[
      "dashboard.view","pets.view",
      "appointments.view",
      "service_orders.view","service_orders.update_status"
    ]'::jsonb
    WHEN 'finance' THEN '[
      "dashboard.view",
      "finance.view","finance.create","finance.edit","finance.close_cash",
      "reports.view",
      "pos.use","pos.receive_payment","pos.close_cash"
    ]'::jsonb
    WHEN 'inventory_cash' THEN '[
      "dashboard.view",
      "inventory.view","inventory.manage",
      "pos.use","pos.receive_payment",
      "finance.close_cash","pos.close_cash"
    ]'::jsonb
    ELSE '[
      "dashboard.view",
      "customers.view","customers.create","customers.edit",
      "pets.view","pets.create","pets.edit",
      "appointments.view","appointments.create","appointments.edit",
      "service_orders.view","service_orders.update_status",
      "services.view",
      "finance.create",
      "pos.use","pos.receive_payment"
    ]'::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION private.has_app_permission(p_company_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN p_company_id IS NULL OR p_permission IS NULL THEN false
    WHEN NOT private.member_has_active_access(p_company_id) THEN false
    WHEN private.is_company_owner_or_admin(p_company_id) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = p_company_id
        AND cm.user_id = auth.uid()
        AND cm.access_revoked_at IS NULL
        AND CASE
          WHEN jsonb_typeof(cm.permissions) = 'array'
            AND jsonb_array_length(cm.permissions) > 0
          THEN cm.permissions @> to_jsonb(ARRAY[p_permission]::text[])
          ELSE private.profile_default_permissions(coalesce(cm.access_profile, 'reception'))
            @> to_jsonb(ARRAY[p_permission]::text[])
        END
    )
  END;
$$;

CREATE OR REPLACE FUNCTION private.require_app_permission(p_company_id uuid, p_permission text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  IF NOT private.has_app_permission(p_company_id, p_permission) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.activate_company_context(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.member_has_active_access(p_company_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('petgestor.company_id', p_company_id::text, true);
  RETURN p_company_id;
END;
$$;

-- Nunca infere tenant por ORDER BY created_at. Só o company_id explícito (GUC).
CREATE OR REPLACE FUNCTION private.get_auth_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_setting text;
  v_company_id uuid;
BEGIN
  v_setting := nullif(current_setting('petgestor.company_id', true), '');
  IF v_setting IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_company_id := v_setting::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;

  IF NOT private.member_has_active_access(v_company_id) THEN
    RETURN NULL;
  END IF;

  RETURN v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.try_storage_company_id(p_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public, storage
AS $$
DECLARE
  v_folder text;
  v_company_id uuid;
BEGIN
  v_folder := (storage.foldername(p_name))[1];
  IF v_folder IS NULL OR v_folder = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_company_id := v_folder::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;

  RETURN v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.storage_path_kind(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, storage
AS $$
  SELECT (storage.foldername(p_name))[2];
$$;

REVOKE ALL ON FUNCTION private.is_company_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_company_role(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.member_has_active_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_company_owner_or_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_app_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.require_app_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.activate_company_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_auth_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.profile_default_permissions(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.try_storage_company_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.storage_path_kind(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_company_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.member_has_active_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_company_owner_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_app_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.try_storage_company_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.storage_path_kind(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. company_members / companies: usuário vê a própria membership (inclusive revogada)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS company_members_select_member ON public.company_members;
CREATE POLICY company_members_select_member
  ON public.company_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR private.is_company_member(company_id)
  );

DROP POLICY IF EXISTS companies_select_member ON public.companies;
CREATE POLICY companies_select_member
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    private.is_company_member(id)
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = companies.id
        AND cm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. RLS: mutações exigem permissão granular; SELECT operacional permanece membership ativa
-- ---------------------------------------------------------------------------

-- customers
DROP POLICY IF EXISTS customers_select_member ON public.customers;
CREATE POLICY customers_select_member ON public.customers
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS customers_insert_member ON public.customers;
CREATE POLICY customers_insert_member ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'customers.create')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS customers_update_member ON public.customers;
CREATE POLICY customers_update_member ON public.customers
  FOR UPDATE TO authenticated
  USING (
    private.has_app_permission(company_id, 'customers.edit')
    OR private.has_app_permission(company_id, 'customers.archive')
  )
  WITH CHECK (
    private.has_app_permission(company_id, 'customers.edit')
    OR private.has_app_permission(company_id, 'customers.archive')
  );

-- pets
DROP POLICY IF EXISTS pets_select_member ON public.pets;
CREATE POLICY pets_select_member ON public.pets
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS pets_insert_member ON public.pets;
CREATE POLICY pets_insert_member ON public.pets
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'pets.create')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS pets_update_member ON public.pets;
CREATE POLICY pets_update_member ON public.pets
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'pets.edit'))
  WITH CHECK (private.has_app_permission(company_id, 'pets.edit'));

-- services
DROP POLICY IF EXISTS services_select_member ON public.services;
CREATE POLICY services_select_member ON public.services
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS services_insert_member ON public.services;
CREATE POLICY services_insert_member ON public.services
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS services_update_member ON public.services;
CREATE POLICY services_update_member ON public.services
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'services.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS service_size_prices_select_member ON public.service_size_prices;
CREATE POLICY service_size_prices_select_member ON public.service_size_prices
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_size_prices_insert_member ON public.service_size_prices;
CREATE POLICY service_size_prices_insert_member ON public.service_size_prices
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS service_size_prices_update_member ON public.service_size_prices;
CREATE POLICY service_size_prices_update_member ON public.service_size_prices
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'services.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS service_size_prices_delete_member ON public.service_size_prices;
CREATE POLICY service_size_prices_delete_member ON public.service_size_prices
  FOR DELETE TO authenticated
  USING (private.has_app_permission(company_id, 'services.manage'));

-- employees
DROP POLICY IF EXISTS employees_select_member ON public.employees;
CREATE POLICY employees_select_member ON public.employees
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS employees_insert_member ON public.employees;
CREATE POLICY employees_insert_member ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'employees.manage'));

DROP POLICY IF EXISTS employees_update_member ON public.employees;
CREATE POLICY employees_update_member ON public.employees
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'employees.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'employees.manage'));

DROP POLICY IF EXISTS employee_services_select_member ON public.employee_services;
CREATE POLICY employee_services_select_member ON public.employee_services
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS employee_services_insert_member ON public.employee_services;
CREATE POLICY employee_services_insert_member ON public.employee_services
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'employees.manage'));

DROP POLICY IF EXISTS employee_services_delete_member ON public.employee_services;
CREATE POLICY employee_services_delete_member ON public.employee_services
  FOR DELETE TO authenticated
  USING (private.has_app_permission(company_id, 'employees.manage'));

DROP POLICY IF EXISTS employee_working_hours_select_member ON public.employee_working_hours;
CREATE POLICY employee_working_hours_select_member ON public.employee_working_hours
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS employee_working_hours_insert_member ON public.employee_working_hours;
CREATE POLICY employee_working_hours_insert_member ON public.employee_working_hours
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'employees.manage'));

DROP POLICY IF EXISTS employee_working_hours_update_member ON public.employee_working_hours;
CREATE POLICY employee_working_hours_update_member ON public.employee_working_hours
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'employees.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'employees.manage'));

DROP POLICY IF EXISTS employee_working_hours_delete_member ON public.employee_working_hours;
CREATE POLICY employee_working_hours_delete_member ON public.employee_working_hours
  FOR DELETE TO authenticated
  USING (private.has_app_permission(company_id, 'employees.manage'));

-- appointments
DROP POLICY IF EXISTS appointments_select_member ON public.appointments;
CREATE POLICY appointments_select_member ON public.appointments
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'appointments.view'));

DROP POLICY IF EXISTS appointments_insert_member ON public.appointments;
CREATE POLICY appointments_insert_member ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'appointments.create'));

DROP POLICY IF EXISTS appointments_update_member ON public.appointments;
CREATE POLICY appointments_update_member ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    private.has_app_permission(company_id, 'appointments.edit')
    OR private.has_app_permission(company_id, 'appointments.cancel')
  )
  WITH CHECK (
    CASE
      WHEN status = 'cancelled' THEN private.has_app_permission(company_id, 'appointments.cancel')
      ELSE (
        private.has_app_permission(company_id, 'appointments.edit')
        OR private.has_app_permission(company_id, 'appointments.cancel')
      )
    END
  );

REVOKE INSERT ON public.appointments FROM authenticated;

-- service_orders
DROP POLICY IF EXISTS service_orders_select ON public.service_orders;
CREATE POLICY service_orders_select ON public.service_orders
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'service_orders.view'));

DROP POLICY IF EXISTS service_orders_insert ON public.service_orders;
CREATE POLICY service_orders_insert ON public.service_orders
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'service_orders.update_status'));

DROP POLICY IF EXISTS service_orders_update ON public.service_orders;
CREATE POLICY service_orders_update ON public.service_orders
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'service_orders.update_status'))
  WITH CHECK (private.has_app_permission(company_id, 'service_orders.update_status'));

REVOKE INSERT ON public.service_orders FROM authenticated;

-- waitlist / time blocks / recurrences
DROP POLICY IF EXISTS appointment_waitlist_select_member ON public.appointment_waitlist;
CREATE POLICY appointment_waitlist_select_member ON public.appointment_waitlist
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'appointments.view'));

DROP POLICY IF EXISTS appointment_waitlist_insert_member ON public.appointment_waitlist;
CREATE POLICY appointment_waitlist_insert_member ON public.appointment_waitlist
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'appointments.create'));

DROP POLICY IF EXISTS appointment_waitlist_update_member ON public.appointment_waitlist;
CREATE POLICY appointment_waitlist_update_member ON public.appointment_waitlist
  FOR UPDATE TO authenticated
  USING (
    private.has_app_permission(company_id, 'appointments.edit')
    OR private.has_app_permission(company_id, 'appointments.cancel')
  )
  WITH CHECK (
    private.has_app_permission(company_id, 'appointments.edit')
    OR private.has_app_permission(company_id, 'appointments.cancel')
  );

DROP POLICY IF EXISTS schedule_time_blocks_select_member ON public.schedule_time_blocks;
CREATE POLICY schedule_time_blocks_select_member ON public.schedule_time_blocks
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'appointments.view'));

DROP POLICY IF EXISTS schedule_time_blocks_insert_member ON public.schedule_time_blocks;
CREATE POLICY schedule_time_blocks_insert_member ON public.schedule_time_blocks
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'appointments.edit'));

DROP POLICY IF EXISTS schedule_time_blocks_update_member ON public.schedule_time_blocks;
CREATE POLICY schedule_time_blocks_update_member ON public.schedule_time_blocks
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'appointments.edit'))
  WITH CHECK (private.has_app_permission(company_id, 'appointments.edit'));

DROP POLICY IF EXISTS appointment_recurrences_select_member ON public.appointment_recurrences;
CREATE POLICY appointment_recurrences_select_member ON public.appointment_recurrences
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'appointments.view'));

DROP POLICY IF EXISTS appointment_recurrences_insert_member ON public.appointment_recurrences;
CREATE POLICY appointment_recurrences_insert_member ON public.appointment_recurrences
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'appointments.create'));

DROP POLICY IF EXISTS appointment_recurrences_update_member ON public.appointment_recurrences;
CREATE POLICY appointment_recurrences_update_member ON public.appointment_recurrences
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'appointments.edit'))
  WITH CHECK (private.has_app_permission(company_id, 'appointments.edit'));

-- finance
DROP POLICY IF EXISTS financial_entries_select ON public.financial_entries;
CREATE POLICY financial_entries_select ON public.financial_entries
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'finance.view'));

DROP POLICY IF EXISTS financial_entries_insert ON public.financial_entries;
CREATE POLICY financial_entries_insert ON public.financial_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'finance.create')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS financial_entries_update ON public.financial_entries;
CREATE POLICY financial_entries_update ON public.financial_entries
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'finance.edit'))
  WITH CHECK (private.has_app_permission(company_id, 'finance.edit'));

DROP POLICY IF EXISTS financial_payments_select ON public.financial_payments;
CREATE POLICY financial_payments_select ON public.financial_payments
  FOR SELECT TO authenticated
  USING (
    private.has_app_permission(company_id, 'finance.view')
    OR private.has_app_permission(company_id, 'pos.use')
  );

DROP POLICY IF EXISTS financial_payments_insert ON public.financial_payments;
CREATE POLICY financial_payments_insert ON public.financial_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      private.has_app_permission(company_id, 'finance.create')
      OR private.has_app_permission(company_id, 'pos.receive_payment')
    )
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS financial_payments_update ON public.financial_payments;
CREATE POLICY financial_payments_update ON public.financial_payments
  FOR UPDATE TO authenticated
  USING (
    private.has_app_permission(company_id, 'finance.edit')
    OR private.has_app_permission(company_id, 'pos.receive_payment')
  )
  WITH CHECK (
    private.has_app_permission(company_id, 'finance.edit')
    OR private.has_app_permission(company_id, 'pos.receive_payment')
  );

-- packages
DROP POLICY IF EXISTS service_packages_select_member ON public.service_packages;
CREATE POLICY service_packages_select_member ON public.service_packages
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_packages_insert_member ON public.service_packages;
CREATE POLICY service_packages_insert_member ON public.service_packages
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'services.manage')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS service_packages_update_member ON public.service_packages;
CREATE POLICY service_packages_update_member ON public.service_packages
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'services.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS service_package_items_select_member ON public.service_package_items;
CREATE POLICY service_package_items_select_member ON public.service_package_items
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS service_package_items_insert_member ON public.service_package_items;
CREATE POLICY service_package_items_insert_member ON public.service_package_items
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS service_package_items_update_member ON public.service_package_items;
CREATE POLICY service_package_items_update_member ON public.service_package_items
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'services.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS service_package_items_delete_member ON public.service_package_items;
CREATE POLICY service_package_items_delete_member ON public.service_package_items
  FOR DELETE TO authenticated
  USING (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS customer_service_packages_select_member ON public.customer_service_packages;
CREATE POLICY customer_service_packages_select_member ON public.customer_service_packages
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_packages_insert_member ON public.customer_service_packages;
CREATE POLICY customer_service_packages_insert_member ON public.customer_service_packages
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'finance.create')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS customer_service_packages_update_member ON public.customer_service_packages;
CREATE POLICY customer_service_packages_update_member ON public.customer_service_packages
  FOR UPDATE TO authenticated
  USING (
    private.has_app_permission(company_id, 'finance.edit')
    OR private.has_app_permission(company_id, 'service_orders.update_status')
  )
  WITH CHECK (
    private.has_app_permission(company_id, 'finance.edit')
    OR private.has_app_permission(company_id, 'service_orders.update_status')
  );

DROP POLICY IF EXISTS customer_service_package_items_select_member ON public.customer_service_package_items;
CREATE POLICY customer_service_package_items_select_member ON public.customer_service_package_items
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_package_items_insert_member ON public.customer_service_package_items;
CREATE POLICY customer_service_package_items_insert_member ON public.customer_service_package_items
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'finance.create'));

DROP POLICY IF EXISTS customer_service_package_items_update_member ON public.customer_service_package_items;
CREATE POLICY customer_service_package_items_update_member ON public.customer_service_package_items
  FOR UPDATE TO authenticated
  USING (
    private.has_app_permission(company_id, 'finance.edit')
    OR private.has_app_permission(company_id, 'service_orders.update_status')
  )
  WITH CHECK (
    private.has_app_permission(company_id, 'finance.edit')
    OR private.has_app_permission(company_id, 'service_orders.update_status')
  );

DROP POLICY IF EXISTS customer_service_package_usages_select_member ON public.customer_service_package_usages;
CREATE POLICY customer_service_package_usages_select_member ON public.customer_service_package_usages
  FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));

DROP POLICY IF EXISTS customer_service_package_usages_insert_member ON public.customer_service_package_usages;
CREATE POLICY customer_service_package_usages_insert_member ON public.customer_service_package_usages
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'service_orders.update_status'));

DROP POLICY IF EXISTS customer_service_package_usages_update_member ON public.customer_service_package_usages;
CREATE POLICY customer_service_package_usages_update_member ON public.customer_service_package_usages
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'service_orders.update_status'))
  WITH CHECK (private.has_app_permission(company_id, 'service_orders.update_status'));

-- inventory
DROP POLICY IF EXISTS product_categories_select_member ON public.product_categories;
CREATE POLICY product_categories_select_member ON public.product_categories
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'inventory.view'));

DROP POLICY IF EXISTS product_categories_insert_member ON public.product_categories;
CREATE POLICY product_categories_insert_member ON public.product_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'inventory.manage')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS product_categories_update_member ON public.product_categories;
CREATE POLICY product_categories_update_member ON public.product_categories
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'inventory.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'inventory.manage'));

DROP POLICY IF EXISTS inventory_suppliers_select_member ON public.inventory_suppliers;
CREATE POLICY inventory_suppliers_select_member ON public.inventory_suppliers
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'inventory.view'));

DROP POLICY IF EXISTS inventory_suppliers_insert_member ON public.inventory_suppliers;
CREATE POLICY inventory_suppliers_insert_member ON public.inventory_suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'inventory.manage')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS inventory_suppliers_update_member ON public.inventory_suppliers;
CREATE POLICY inventory_suppliers_update_member ON public.inventory_suppliers
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'inventory.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'inventory.manage'));

DROP POLICY IF EXISTS products_select_member ON public.products;
CREATE POLICY products_select_member ON public.products
  FOR SELECT TO authenticated
  USING (
    private.has_app_permission(company_id, 'inventory.view')
    OR private.has_app_permission(company_id, 'pos.use')
  );

DROP POLICY IF EXISTS products_insert_member ON public.products;
CREATE POLICY products_insert_member ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'inventory.manage')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS products_update_member ON public.products;
CREATE POLICY products_update_member ON public.products
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'inventory.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'inventory.manage'));

DROP POLICY IF EXISTS product_batches_select_member ON public.product_batches;
CREATE POLICY product_batches_select_member ON public.product_batches
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'inventory.view'));

DROP POLICY IF EXISTS stock_movements_select_member ON public.stock_movements;
CREATE POLICY stock_movements_select_member ON public.stock_movements
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'inventory.view'));

DROP POLICY IF EXISTS service_product_recipes_select_member ON public.service_product_recipes;
CREATE POLICY service_product_recipes_select_member ON public.service_product_recipes
  FOR SELECT TO authenticated
  USING (
    private.is_company_member(company_id)
    AND (
      private.has_app_permission(company_id, 'services.view')
      OR private.has_app_permission(company_id, 'inventory.view')
    )
  );

DROP POLICY IF EXISTS service_product_recipes_insert_member ON public.service_product_recipes;
CREATE POLICY service_product_recipes_insert_member ON public.service_product_recipes
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS service_product_recipes_update_member ON public.service_product_recipes;
CREATE POLICY service_product_recipes_update_member ON public.service_product_recipes
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'services.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS service_product_recipes_delete_member ON public.service_product_recipes;
CREATE POLICY service_product_recipes_delete_member ON public.service_product_recipes
  FOR DELETE TO authenticated
  USING (private.has_app_permission(company_id, 'services.manage'));

DROP POLICY IF EXISTS so_consumptions_select_member ON public.service_order_consumptions;
CREATE POLICY so_consumptions_select_member ON public.service_order_consumptions
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'service_orders.view'));

DROP POLICY IF EXISTS so_consumptions_insert_member ON public.service_order_consumptions;
CREATE POLICY so_consumptions_insert_member ON public.service_order_consumptions
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'service_orders.update_status')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS so_consumptions_update_member ON public.service_order_consumptions;
CREATE POLICY so_consumptions_update_member ON public.service_order_consumptions
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'service_orders.update_status'))
  WITH CHECK (private.has_app_permission(company_id, 'service_orders.update_status'));

DROP POLICY IF EXISTS so_consumptions_delete_member ON public.service_order_consumptions;
CREATE POLICY so_consumptions_delete_member ON public.service_order_consumptions
  FOR DELETE TO authenticated
  USING (private.has_app_permission(company_id, 'service_orders.update_status'));

-- POS
DROP POLICY IF EXISTS sales_select_member ON public.sales;
CREATE POLICY sales_select_member ON public.sales
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'pos.use'));

DROP POLICY IF EXISTS sales_insert_member ON public.sales;
CREATE POLICY sales_insert_member ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'pos.use')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS sales_update_member ON public.sales;
CREATE POLICY sales_update_member ON public.sales
  FOR UPDATE TO authenticated
  USING (
    private.has_app_permission(company_id, 'pos.use')
    OR private.has_app_permission(company_id, 'pos.cancel_sale')
  )
  WITH CHECK (
    private.has_app_permission(company_id, 'pos.use')
    OR private.has_app_permission(company_id, 'pos.cancel_sale')
  );

DROP POLICY IF EXISTS sale_items_select_member ON public.sale_items;
CREATE POLICY sale_items_select_member ON public.sale_items
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'pos.use'));

DROP POLICY IF EXISTS cash_sessions_select_member ON public.cash_sessions;
CREATE POLICY cash_sessions_select_member ON public.cash_sessions
  FOR SELECT TO authenticated
  USING (
    private.has_app_permission(company_id, 'pos.use')
    OR private.has_app_permission(company_id, 'pos.close_cash')
  );

DROP POLICY IF EXISTS cash_sessions_insert_member ON public.cash_sessions;
CREATE POLICY cash_sessions_insert_member ON public.cash_sessions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'pos.close_cash'));

DROP POLICY IF EXISTS cash_sessions_update_member ON public.cash_sessions;
CREATE POLICY cash_sessions_update_member ON public.cash_sessions
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'pos.close_cash'))
  WITH CHECK (private.has_app_permission(company_id, 'pos.close_cash'));

REVOKE INSERT ON public.sales FROM authenticated;
REVOKE INSERT ON public.cash_sessions FROM authenticated;

-- attachments
DROP POLICY IF EXISTS pet_attachments_select_member ON public.pet_attachments;
CREATE POLICY pet_attachments_select_member ON public.pet_attachments
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'pets.view'));

DROP POLICY IF EXISTS pet_attachments_insert_member ON public.pet_attachments;
CREATE POLICY pet_attachments_insert_member ON public.pet_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'pets.edit')
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS pet_attachments_update_member ON public.pet_attachments;
CREATE POLICY pet_attachments_update_member ON public.pet_attachments
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'pets.edit'))
  WITH CHECK (private.has_app_permission(company_id, 'pets.edit'));

DROP POLICY IF EXISTS service_order_attachments_select_member ON public.service_order_attachments;
CREATE POLICY service_order_attachments_select_member ON public.service_order_attachments
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'service_orders.view'));

DROP POLICY IF EXISTS service_order_attachments_insert_member ON public.service_order_attachments;
CREATE POLICY service_order_attachments_insert_member ON public.service_order_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_app_permission(company_id, 'service_orders.update_status')
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS service_order_attachments_update_member ON public.service_order_attachments;
CREATE POLICY service_order_attachments_update_member ON public.service_order_attachments
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'service_orders.update_status'))
  WITH CHECK (private.has_app_permission(company_id, 'service_orders.update_status'));

-- notifications / settings
DROP POLICY IF EXISTS company_notification_settings_select_member
  ON public.company_notification_settings;
CREATE POLICY company_notification_settings_select_member
  ON public.company_notification_settings
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'settings.view'));

DROP POLICY IF EXISTS company_notification_settings_insert_member
  ON public.company_notification_settings;
CREATE POLICY company_notification_settings_insert_member
  ON public.company_notification_settings
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'settings.manage'));

DROP POLICY IF EXISTS company_notification_settings_update_member
  ON public.company_notification_settings;
CREATE POLICY company_notification_settings_update_member
  ON public.company_notification_settings
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'settings.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'settings.manage'));

DROP POLICY IF EXISTS notification_queue_select_member ON public.notification_queue;
CREATE POLICY notification_queue_select_member ON public.notification_queue
  FOR SELECT TO authenticated
  USING (private.has_app_permission(company_id, 'settings.view'));

DROP POLICY IF EXISTS notification_queue_insert_member ON public.notification_queue;
CREATE POLICY notification_queue_insert_member ON public.notification_queue
  FOR INSERT TO authenticated
  WITH CHECK (private.has_app_permission(company_id, 'settings.manage'));

DROP POLICY IF EXISTS notification_queue_update_member ON public.notification_queue;
CREATE POLICY notification_queue_update_member ON public.notification_queue
  FOR UPDATE TO authenticated
  USING (private.has_app_permission(company_id, 'settings.manage'))
  WITH CHECK (private.has_app_permission(company_id, 'settings.manage'));

DROP POLICY IF EXISTS app_notifications_select_member ON public.app_notifications;
CREATE POLICY app_notifications_select_member ON public.app_notifications
  FOR SELECT TO authenticated
  USING (
    private.is_company_member(company_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS app_notifications_insert_member ON public.app_notifications;
CREATE POLICY app_notifications_insert_member ON public.app_notifications
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(company_id));

DROP POLICY IF EXISTS app_notifications_update_member ON public.app_notifications;
CREATE POLICY app_notifications_update_member ON public.app_notifications
  FOR UPDATE TO authenticated
  USING (
    private.is_company_member(company_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  )
  WITH CHECK (
    private.is_company_member(company_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS onboarding_progress_select_own ON public.onboarding_progress;
CREATE POLICY onboarding_progress_select_own ON public.onboarding_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND private.is_company_member(company_id));

DROP POLICY IF EXISTS onboarding_progress_insert_own ON public.onboarding_progress;
CREATE POLICY onboarding_progress_insert_own ON public.onboarding_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_company_member(company_id));

DROP POLICY IF EXISTS onboarding_progress_update_own ON public.onboarding_progress;
CREATE POLICY onboarding_progress_update_own ON public.onboarding_progress
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND private.is_company_member(company_id))
  WITH CHECK (user_id = auth.uid() AND private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- 4. Storage: membership ativa + pasta da empresa + permissão por tipo de path
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS company_files_select ON storage.objects;
CREATE POLICY company_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-files'
    AND private.is_company_member(private.try_storage_company_id(name))
  );

DROP POLICY IF EXISTS company_files_insert ON storage.objects;
CREATE POLICY company_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-files'
    AND private.is_company_member(private.try_storage_company_id(name))
    AND (
      (
        private.storage_path_kind(name) = 'pets'
        AND private.has_app_permission(private.try_storage_company_id(name), 'pets.edit')
      )
      OR (
        private.storage_path_kind(name) = 'service-orders'
        AND private.has_app_permission(
          private.try_storage_company_id(name),
          'service_orders.update_status'
        )
      )
    )
  );

DROP POLICY IF EXISTS company_files_update ON storage.objects;
CREATE POLICY company_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-files'
    AND private.is_company_member(private.try_storage_company_id(name))
    AND (
      (
        private.storage_path_kind(name) = 'pets'
        AND private.has_app_permission(private.try_storage_company_id(name), 'pets.edit')
      )
      OR (
        private.storage_path_kind(name) = 'service-orders'
        AND private.has_app_permission(
          private.try_storage_company_id(name),
          'service_orders.update_status'
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'company-files'
    AND private.is_company_member(private.try_storage_company_id(name))
    AND (
      (
        private.storage_path_kind(name) = 'pets'
        AND private.has_app_permission(private.try_storage_company_id(name), 'pets.edit')
      )
      OR (
        private.storage_path_kind(name) = 'service-orders'
        AND private.has_app_permission(
          private.try_storage_company_id(name),
          'service_orders.update_status'
        )
      )
    )
  );

DROP POLICY IF EXISTS company_files_delete ON storage.objects;
CREATE POLICY company_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-files'
    AND private.is_company_member(private.try_storage_company_id(name))
    AND (
      (
        private.storage_path_kind(name) = 'pets'
        AND private.has_app_permission(private.try_storage_company_id(name), 'pets.edit')
      )
      OR (
        private.storage_path_kind(name) = 'service-orders'
        AND private.has_app_permission(
          private.try_storage_company_id(name),
          'service_orders.update_status'
        )
      )
    )
  );

-- Auto-generated RPC wrappers with explicit p_company_id
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'cancel_customer_service_package',
        'cancel_financial_entry',
        'cancel_product_sale',
        'cancel_service_order',
        'check_in_appointment',
        'close_cash_session',
        'complete_product_sale',
        'complete_service_order',
        'consume_customer_service_package',
        'create_appointment',
        'create_employee_with_schedule',
        'create_service_package_with_items',
        'create_service_with_prices',
        'grant_employee_access',
        'mark_financial_entry_paid',
        'mark_service_order_ready',
        'open_cash_session',
        'register_sale_payment',
        'remove_service_order_consumption',
        'reopen_financial_entry',
        'replace_service_product_recipes',
        'reverse_customer_service_package_usage',
        'revoke_employee_access',
        'seed_service_order_consumptions',
        'sell_customer_service_package',
        'start_service_order',
        'update_appointment',
        'update_employee_access',
        'update_employee_with_schedule',
        'update_service_order_notes',
        'update_service_package_with_items',
        'update_service_with_prices',
        'register_stock_movement',
        'upsert_service_order_consumption'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA private', r.sig);
  END LOOP;
END;
$$;



CREATE OR REPLACE FUNCTION public.register_stock_movement(
  p_product_id uuid,
  p_type text,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_unit_cost_cents integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_batch_code text DEFAULT NULL,
  p_expiration_date date DEFAULT NULL,
  p_counted_stock numeric DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  IF p_company_id IS NOT NULL THEN
    PERFORM private.activate_company_context(p_company_id);
    IF p_type = 'adjustment' THEN
      PERFORM private.require_app_permission(p_company_id, 'inventory.adjust');
    ELSE
      PERFORM private.require_app_permission(p_company_id, 'inventory.manage');
    END IF;
  ELSIF private.get_auth_company_id() IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN private.register_stock_movement(
    p_product_id,
    p_type,
    p_quantity,
    p_idempotency_key,
    p_unit_cost_cents,
    p_reason,
    p_notes,
    p_supplier_id,
    p_batch_code,
    p_expiration_date,
    p_counted_stock,
    p_reference_type,
    p_reference_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_stock_movement(
  uuid, text, numeric, uuid, integer, text, text, uuid, text, date, numeric, text, uuid, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_stock_movement(
  uuid, text, numeric, uuid, integer, text, text, uuid, text, date, numeric, text, uuid, uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_service_with_prices(
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean DEFAULT true,
  p_size_prices jsonb DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'services.manage');
  RETURN private.create_service_with_prices(p_name, p_description, p_pricing_mode, p_price_cents, p_duration_minutes, p_active, p_size_prices);
END;
$$;

REVOKE ALL ON FUNCTION public.create_service_with_prices(
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_service_with_prices(
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_service_with_prices(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'services.manage');
  RETURN private.update_service_with_prices(p_service_id, p_name, p_description, p_pricing_mode, p_price_cents, p_duration_minutes, p_active, p_size_prices);
END;
$$;

REVOKE ALL ON FUNCTION public.update_service_with_prices(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_service_with_prices(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.grant_employee_access(
  p_employee_id uuid,
  p_email text,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean DEFAULT false,
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'employees.manage');
  RETURN private.grant_employee_access(p_employee_id, p_email, p_access_profile, p_permissions, p_own_schedule_only);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_employee_access(
  p_employee_id uuid,
  p_email text,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.grant_employee_access(
  p_employee_id uuid,
  p_email text,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_employee_access(
  p_employee_id uuid,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean DEFAULT false,
  p_company_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'employees.manage');
  PERFORM private.update_employee_access(p_employee_id, p_access_profile, p_permissions, p_own_schedule_only);
END;
$$;

REVOKE ALL ON FUNCTION public.update_employee_access(
  p_employee_id uuid,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_employee_access(
  p_employee_id uuid,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.revoke_employee_access(
  p_employee_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'employees.manage');
  PERFORM private.revoke_employee_access(p_employee_id);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_employee_access(
  p_employee_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.revoke_employee_access(
  p_employee_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_employee_with_schedule(
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean DEFAULT true,
  p_can_be_scheduled boolean DEFAULT true,
  p_service_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_working_hours jsonb DEFAULT '[]'::jsonb,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'employees.manage');
  RETURN private.create_employee_with_schedule(p_name, p_phone, p_email, p_job_title, p_notes, p_active, p_can_be_scheduled, p_service_ids, p_working_hours);
END;
$$;

REVOKE ALL ON FUNCTION public.create_employee_with_schedule(
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean,
  p_can_be_scheduled boolean,
  p_service_ids uuid[],
  p_working_hours jsonb,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_employee_with_schedule(
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean,
  p_can_be_scheduled boolean,
  p_service_ids uuid[],
  p_working_hours jsonb,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_employee_with_schedule(
  p_employee_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean,
  p_can_be_scheduled boolean,
  p_service_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_working_hours jsonb DEFAULT '[]'::jsonb,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'employees.manage');
  RETURN private.update_employee_with_schedule(p_employee_id, p_name, p_phone, p_email, p_job_title, p_notes, p_active, p_can_be_scheduled, p_service_ids, p_working_hours);
END;
$$;

REVOKE ALL ON FUNCTION public.update_employee_with_schedule(
  p_employee_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean,
  p_can_be_scheduled boolean,
  p_service_ids uuid[],
  p_working_hours jsonb,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_employee_with_schedule(
  p_employee_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean,
  p_can_be_scheduled boolean,
  p_service_ids uuid[],
  p_working_hours jsonb,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_appointment(
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_customer_package_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'appointments.create');
  RETURN private.create_appointment(p_pet_id, p_service_id, p_employee_id, p_scheduled_start, p_pet_size, p_notes, p_customer_package_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text,
  p_notes text,
  p_customer_package_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_appointment(
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text,
  p_notes text,
  p_customer_package_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_appointment(
  p_appointment_id uuid,
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_customer_package_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'appointments.edit');
  RETURN private.update_appointment(p_appointment_id, p_pet_id, p_service_id, p_employee_id, p_scheduled_start, p_pet_size, p_notes, p_customer_package_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_appointment(
  p_appointment_id uuid,
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text,
  p_notes text,
  p_customer_package_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_appointment(
  p_appointment_id uuid,
  p_pet_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_scheduled_start timestamptz,
  p_pet_size text,
  p_notes text,
  p_customer_package_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.check_in_appointment(
  p_appointment_id uuid,
  p_intake_notes text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.check_in_appointment(p_appointment_id, p_intake_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_appointment(
  p_appointment_id uuid,
  p_intake_notes text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_in_appointment(
  p_appointment_id uuid,
  p_intake_notes text,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.start_service_order(
  p_service_order_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.start_service_order(p_service_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.start_service_order(
  p_service_order_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_service_order(
  p_service_order_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_service_order_ready(
  p_service_order_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.mark_service_order_ready(p_service_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_service_order_ready(
  p_service_order_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mark_service_order_ready(
  p_service_order_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.replace_service_product_recipes(
  p_service_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'services.manage');
  RETURN private.replace_service_product_recipes(p_service_id, p_items);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_service_product_recipes(
  p_service_id uuid,
  p_items jsonb,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.replace_service_product_recipes(
  p_service_id uuid,
  p_items jsonb,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.seed_service_order_consumptions(
  p_service_order_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.seed_service_order_consumptions(p_service_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_service_order_consumptions(
  p_service_order_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.seed_service_order_consumptions(
  p_service_order_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.upsert_service_order_consumption(
  p_service_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_source text DEFAULT 'manual',
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.upsert_service_order_consumption(p_service_order_id, p_product_id, p_quantity, p_source);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_service_order_consumption(
  p_service_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_source text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_service_order_consumption(
  p_service_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_source text,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.remove_service_order_consumption(
  p_consumption_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.remove_service_order_consumption(p_consumption_id);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_service_order_consumption(
  p_consumption_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.remove_service_order_consumption(
  p_consumption_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.complete_service_order(
  p_service_order_id uuid,
  p_completion_notes text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.complete_service_order(p_service_order_id, p_completion_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_service_order(
  p_service_order_id uuid,
  p_completion_notes text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_service_order(
  p_service_order_id uuid,
  p_completion_notes text,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_service_order(
  p_service_order_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.cancel_service_order(p_service_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_service_order(
  p_service_order_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_service_order(
  p_service_order_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_service_order_notes(
  p_service_order_id uuid,
  p_intake_notes text DEFAULT NULL,
  p_internal_notes text DEFAULT NULL,
  p_completion_notes text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.update_service_order_notes(p_service_order_id, p_intake_notes, p_internal_notes, p_completion_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.update_service_order_notes(
  p_service_order_id uuid,
  p_intake_notes text,
  p_internal_notes text,
  p_completion_notes text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_service_order_notes(
  p_service_order_id uuid,
  p_intake_notes text,
  p_internal_notes text,
  p_completion_notes text,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_financial_entry_paid(
  p_entry_id uuid,
  p_payment_method text,
  p_paid_at timestamptz DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'finance.create');
  RETURN private.mark_financial_entry_paid(p_entry_id, p_payment_method, p_paid_at);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_financial_entry_paid(
  p_entry_id uuid,
  p_payment_method text,
  p_paid_at timestamptz,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(
  p_entry_id uuid,
  p_payment_method text,
  p_paid_at timestamptz,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.reopen_financial_entry(
  p_entry_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'finance.edit');
  RETURN private.reopen_financial_entry(p_entry_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_financial_entry(
  p_entry_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reopen_financial_entry(
  p_entry_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_financial_entry(
  p_entry_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'finance.edit');
  RETURN private.cancel_financial_entry(p_entry_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_financial_entry(
  p_entry_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_financial_entry(
  p_entry_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_service_package_with_items(
  p_name text,
  p_description text,
  p_price_cents integer,
  p_validity_days integer,
  p_active boolean DEFAULT true,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'services.manage');
  RETURN private.create_service_package_with_items(p_name, p_description, p_price_cents, p_validity_days, p_active, p_items);
END;
$$;

REVOKE ALL ON FUNCTION public.create_service_package_with_items(
  p_name text,
  p_description text,
  p_price_cents integer,
  p_validity_days integer,
  p_active boolean,
  p_items jsonb,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_service_package_with_items(
  p_name text,
  p_description text,
  p_price_cents integer,
  p_validity_days integer,
  p_active boolean,
  p_items jsonb,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_service_package_with_items(
  p_package_id uuid,
  p_name text,
  p_description text,
  p_price_cents integer,
  p_validity_days integer,
  p_active boolean,
  p_items jsonb,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'services.manage');
  RETURN private.update_service_package_with_items(p_package_id, p_name, p_description, p_price_cents, p_validity_days, p_active, p_items);
END;
$$;

REVOKE ALL ON FUNCTION public.update_service_package_with_items(
  p_package_id uuid,
  p_name text,
  p_description text,
  p_price_cents integer,
  p_validity_days integer,
  p_active boolean,
  p_items jsonb,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_service_package_with_items(
  p_package_id uuid,
  p_name text,
  p_description text,
  p_price_cents integer,
  p_validity_days integer,
  p_active boolean,
  p_items jsonb,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.sell_customer_service_package(
  p_package_id uuid,
  p_customer_id uuid,
  p_pet_id uuid,
  p_starts_at date,
  p_financial_status text DEFAULT 'pending',
  p_payment_method text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'finance.create');
  RETURN private.sell_customer_service_package(p_package_id, p_customer_id, p_pet_id, p_starts_at, p_financial_status, p_payment_method);
END;
$$;

REVOKE ALL ON FUNCTION public.sell_customer_service_package(
  p_package_id uuid,
  p_customer_id uuid,
  p_pet_id uuid,
  p_starts_at date,
  p_financial_status text,
  p_payment_method text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sell_customer_service_package(
  p_package_id uuid,
  p_customer_id uuid,
  p_pet_id uuid,
  p_starts_at date,
  p_financial_status text,
  p_payment_method text,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.consume_customer_service_package(
  p_service_order_id uuid,
  p_customer_package_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.consume_customer_service_package(p_service_order_id, p_customer_package_id);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_customer_service_package(
  p_service_order_id uuid,
  p_customer_package_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_customer_service_package(
  p_service_order_id uuid,
  p_customer_package_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.reverse_customer_service_package_usage(
  p_service_order_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'service_orders.update_status');
  RETURN private.reverse_customer_service_package_usage(p_service_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_customer_service_package_usage(
  p_service_order_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reverse_customer_service_package_usage(
  p_service_order_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_customer_service_package(
  p_customer_package_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'finance.edit');
  RETURN private.cancel_customer_service_package(p_customer_package_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_customer_service_package(
  p_customer_package_id uuid,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_customer_service_package(
  p_customer_package_id uuid,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.complete_product_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_payments jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount_type text DEFAULT NULL,
  p_discount_fixed_cents integer DEFAULT 0,
  p_discount_percent numeric DEFAULT NULL,
  p_cash_received_cents integer DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'pos.use');
  RETURN private.complete_product_sale(p_idempotency_key, p_items, p_payments, p_customer_id, p_discount_type, p_discount_fixed_cents, p_discount_percent, p_cash_received_cents);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_product_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_payments jsonb,
  p_customer_id uuid,
  p_discount_type text,
  p_discount_fixed_cents integer,
  p_discount_percent numeric,
  p_cash_received_cents integer,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_product_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_payments jsonb,
  p_customer_id uuid,
  p_discount_type text,
  p_discount_fixed_cents integer,
  p_discount_percent numeric,
  p_cash_received_cents integer,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_product_sale(
  p_sale_id uuid,
  p_reason text,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'pos.cancel_sale');
  RETURN private.cancel_product_sale(p_sale_id, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_product_sale(
  p_sale_id uuid,
  p_reason text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_product_sale(
  p_sale_id uuid,
  p_reason text,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.register_sale_payment(
  p_sale_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_idempotency_key text,
  p_paid_at timestamptz DEFAULT now(),
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'pos.receive_payment');
  RETURN private.register_sale_payment(p_sale_id, p_amount_cents, p_payment_method, p_idempotency_key, p_paid_at);
END;
$$;

REVOKE ALL ON FUNCTION public.register_sale_payment(
  p_sale_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_idempotency_key text,
  p_paid_at timestamptz,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_sale_payment(
  p_sale_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_idempotency_key text,
  p_paid_at timestamptz,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_opening_balance_cents integer DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'pos.close_cash');
  RETURN private.open_cash_session(p_opening_balance_cents, p_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.open_cash_session(
  p_opening_balance_cents integer,
  p_notes text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.open_cash_session(
  p_opening_balance_cents integer,
  p_notes text,
  p_company_id uuid
) TO authenticated;


CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id uuid,
  p_counted_cash_cents integer,
  p_notes text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
BEGIN
  PERFORM private.activate_company_context(p_company_id);
  PERFORM private.require_app_permission(p_company_id, 'pos.close_cash');
  RETURN private.close_cash_session(p_session_id, p_counted_cash_cents, p_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_session(
  p_session_id uuid,
  p_counted_cash_cents integer,
  p_notes text,
  p_company_id uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.close_cash_session(
  p_session_id uuid,
  p_counted_cash_cents integer,
  p_notes text,
  p_company_id uuid
) TO authenticated;


DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname IN (
        'cancel_customer_service_package',
        'cancel_financial_entry',
        'cancel_product_sale',
        'cancel_service_order',
        'check_in_appointment',
        'close_cash_session',
        'complete_product_sale',
        'complete_service_order',
        'consume_customer_service_package',
        'create_appointment',
        'create_employee_with_schedule',
        'create_service_package_with_items',
        'create_service_with_prices',
        'grant_employee_access',
        'mark_financial_entry_paid',
        'mark_service_order_ready',
        'open_cash_session',
        'register_sale_payment',
        'register_stock_movement',
        'remove_service_order_consumption',
        'reopen_financial_entry',
        'replace_service_product_recipes',
        'reverse_customer_service_package_usage',
        'revoke_employee_access',
        'seed_service_order_consumptions',
        'sell_customer_service_package',
        'start_service_order',
        'update_appointment',
        'update_employee_access',
        'update_employee_with_schedule',
        'update_service_order_notes',
        'update_service_package_with_items',
        'update_service_with_prices',
        'upsert_service_order_consumption'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END;
$$;

-- Patch private implementations that inferred tenant by created_at

CREATE OR REPLACE FUNCTION private.create_service_with_prices(
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean DEFAULT true,
  p_size_prices jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_service_id uuid;
  v_name text;
  v_description text;
  v_min_duration integer;
  v_item jsonb;
  v_size text;
  v_sizes text[] := ARRAY[]::text[];
  v_required_sizes text[] := ARRAY['small', 'medium', 'large', 'giant'];
  v_required_size text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

    v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required'
      USING ERRCODE = '42501';
  END IF;

  v_name := trim(p_name);
  v_description := nullif(trim(coalesce(p_description, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 2000 THEN
    RAISE EXCEPTION 'invalid_description'
      USING ERRCODE = '22023';
  END IF;

  IF p_pricing_mode NOT IN ('fixed', 'by_size') THEN
    RAISE EXCEPTION 'invalid_pricing_mode'
      USING ERRCODE = '22023';
  END IF;

  IF p_pricing_mode = 'fixed' THEN
    IF p_price_cents IS NULL OR p_price_cents < 0 OR p_price_cents > 999999 THEN
      RAISE EXCEPTION 'invalid_price_cents'
        USING ERRCODE = '22023';
    END IF;

    IF p_duration_minutes IS NULL
      OR p_duration_minutes < 5
      OR p_duration_minutes > 720 THEN
      RAISE EXCEPTION 'invalid_duration_minutes'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.services (
      company_id,
      name,
      description,
      pricing_mode,
      price_cents,
      duration_minutes,
      active,
      created_by
    ) VALUES (
      v_company_id,
      v_name,
      v_description,
      'fixed',
      p_price_cents,
      p_duration_minutes,
      coalesce(p_active, true),
      v_user_id
    )
    RETURNING id INTO v_service_id;

    RETURN v_service_id;
  END IF;

  IF p_size_prices IS NULL OR jsonb_typeof(p_size_prices) <> 'array' OR jsonb_array_length(p_size_prices) <> 4 THEN
    RAISE EXCEPTION 'invalid_size_prices'
      USING ERRCODE = '22023';
  END IF;

  v_min_duration := NULL;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_size_prices)
  LOOP
    v_size := v_item->>'size';

    IF v_size IS NULL OR v_size NOT IN ('small', 'medium', 'large', 'giant') THEN
      RAISE EXCEPTION 'invalid_size'
        USING ERRCODE = '22023';
    END IF;

    IF (v_item->>'price_cents')::integer IS NULL
      OR (v_item->>'price_cents')::integer < 0
      OR (v_item->>'price_cents')::integer > 999999 THEN
      RAISE EXCEPTION 'invalid_size_price_cents'
        USING ERRCODE = '22023';
    END IF;

    IF (v_item->>'duration_minutes')::integer IS NULL
      OR (v_item->>'duration_minutes')::integer < 5
      OR (v_item->>'duration_minutes')::integer > 720 THEN
      RAISE EXCEPTION 'invalid_size_duration_minutes'
        USING ERRCODE = '22023';
    END IF;

    IF v_size = ANY (v_sizes) THEN
      RAISE EXCEPTION 'duplicate_size'
        USING ERRCODE = '22023';
    END IF;

    v_sizes := array_append(v_sizes, v_size);

    IF v_min_duration IS NULL OR (v_item->>'duration_minutes')::integer < v_min_duration THEN
      v_min_duration := (v_item->>'duration_minutes')::integer;
    END IF;
  END LOOP;

  FOREACH v_required_size IN ARRAY v_required_sizes
  LOOP
    IF NOT (v_required_size = ANY (v_sizes)) THEN
      RAISE EXCEPTION 'missing_size'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.services (
    company_id,
    name,
    description,
    pricing_mode,
    price_cents,
    duration_minutes,
    active,
    created_by
  ) VALUES (
    v_company_id,
    v_name,
    v_description,
    'by_size',
    NULL,
    v_min_duration,
    coalesce(p_active, true),
    v_user_id
  )
  RETURNING id INTO v_service_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_size_prices)
  LOOP
    INSERT INTO public.service_size_prices (
      company_id,
      service_id,
      size,
      price_cents,
      duration_minutes
    ) VALUES (
      v_company_id,
      v_service_id,
      v_item->>'size',
      (v_item->>'price_cents')::integer,
      (v_item->>'duration_minutes')::integer
    );
  END LOOP;

  RETURN v_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.update_service_with_prices(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_pricing_mode text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean,
  p_size_prices jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_name text;
  v_description text;
  v_min_duration integer;
  v_item jsonb;
  v_size text;
  v_sizes text[] := ARRAY[]::text[];
  v_required_sizes text[] := ARRAY['small', 'medium', 'large', 'giant'];
  v_required_size text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

    v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = p_service_id
      AND s.company_id = v_company_id
      AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'service_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_name := trim(p_name);
  v_description := nullif(trim(coalesce(p_description, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 2000 THEN
    RAISE EXCEPTION 'invalid_description'
      USING ERRCODE = '22023';
  END IF;

  IF p_pricing_mode NOT IN ('fixed', 'by_size') THEN
    RAISE EXCEPTION 'invalid_pricing_mode'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.service_size_prices
  WHERE service_id = p_service_id
    AND company_id = v_company_id;

  IF p_pricing_mode = 'fixed' THEN
    IF p_price_cents IS NULL OR p_price_cents < 0 OR p_price_cents > 999999 THEN
      RAISE EXCEPTION 'invalid_price_cents'
        USING ERRCODE = '22023';
    END IF;

    IF p_duration_minutes IS NULL
      OR p_duration_minutes < 5
      OR p_duration_minutes > 720 THEN
      RAISE EXCEPTION 'invalid_duration_minutes'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.services
    SET
      name = v_name,
      description = v_description,
      pricing_mode = 'fixed',
      price_cents = p_price_cents,
      duration_minutes = p_duration_minutes,
      active = coalesce(p_active, true)
    WHERE id = p_service_id
      AND company_id = v_company_id
      AND deleted_at IS NULL;

    RETURN p_service_id;
  END IF;

  IF p_size_prices IS NULL OR jsonb_typeof(p_size_prices) <> 'array' OR jsonb_array_length(p_size_prices) <> 4 THEN
    RAISE EXCEPTION 'invalid_size_prices'
      USING ERRCODE = '22023';
  END IF;

  v_min_duration := NULL;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_size_prices)
  LOOP
    v_size := v_item->>'size';

    IF v_size IS NULL OR v_size NOT IN ('small', 'medium', 'large', 'giant') THEN
      RAISE EXCEPTION 'invalid_size'
        USING ERRCODE = '22023';
    END IF;

    IF (v_item->>'price_cents')::integer IS NULL
      OR (v_item->>'price_cents')::integer < 0
      OR (v_item->>'price_cents')::integer > 999999 THEN
      RAISE EXCEPTION 'invalid_size_price_cents'
        USING ERRCODE = '22023';
    END IF;

    IF (v_item->>'duration_minutes')::integer IS NULL
      OR (v_item->>'duration_minutes')::integer < 5
      OR (v_item->>'duration_minutes')::integer > 720 THEN
      RAISE EXCEPTION 'invalid_size_duration_minutes'
        USING ERRCODE = '22023';
    END IF;

    IF v_size = ANY (v_sizes) THEN
      RAISE EXCEPTION 'duplicate_size'
        USING ERRCODE = '22023';
    END IF;

    v_sizes := array_append(v_sizes, v_size);

    IF v_min_duration IS NULL OR (v_item->>'duration_minutes')::integer < v_min_duration THEN
      v_min_duration := (v_item->>'duration_minutes')::integer;
    END IF;
  END LOOP;

  FOREACH v_required_size IN ARRAY v_required_sizes
  LOOP
    IF NOT (v_required_size = ANY (v_sizes)) THEN
      RAISE EXCEPTION 'missing_size'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  UPDATE public.services
  SET
    name = v_name,
    description = v_description,
    pricing_mode = 'by_size',
    price_cents = NULL,
    duration_minutes = v_min_duration,
    active = coalesce(p_active, true)
  WHERE id = p_service_id
    AND company_id = v_company_id
    AND deleted_at IS NULL;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_size_prices)
  LOOP
    INSERT INTO public.service_size_prices (
      company_id,
      service_id,
      size,
      price_cents,
      duration_minutes
    ) VALUES (
      v_company_id,
      p_service_id,
      v_item->>'size',
      (v_item->>'price_cents')::integer,
      (v_item->>'duration_minutes')::integer
    );
  END LOOP;

  RETURN p_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.create_employee_with_schedule(
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean DEFAULT true,
  p_can_be_scheduled boolean DEFAULT true,
  p_service_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_working_hours jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_employee_id uuid;
  v_name text;
  v_phone text;
  v_email text;
  v_job_title text;
  v_notes text;
  v_item jsonb;
  v_weekday smallint;
  v_service_id uuid;
  v_distinct_services integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

    v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required'
      USING ERRCODE = '42501';
  END IF;

  v_name := trim(p_name);
  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_job_title := nullif(trim(coalesce(p_job_title, '')), '');
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND (char_length(v_phone) < 10 OR char_length(v_phone) > 11) THEN
    RAISE EXCEPTION 'invalid_phone'
      USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL AND char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email'
      USING ERRCODE = '22023';
  END IF;

  IF v_job_title IS NOT NULL AND char_length(v_job_title) > 80 THEN
    RAISE EXCEPTION 'invalid_job_title'
      USING ERRCODE = '22023';
  END IF;

  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'invalid_notes'
      USING ERRCODE = '22023';
  END IF;

  IF p_working_hours IS NULL OR jsonb_typeof(p_working_hours) <> 'array' THEN
    RAISE EXCEPTION 'invalid_working_hours'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    v_weekday := (v_item->>'weekday')::smallint;

    IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
      RAISE EXCEPTION 'invalid_weekday'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce((v_item->>'enabled')::boolean, false) THEN
      IF (v_item->>'start_time') IS NULL OR (v_item->>'end_time') IS NULL THEN
        RAISE EXCEPTION 'missing_working_hours'
          USING ERRCODE = '22023';
      END IF;

      IF (v_item->>'start_time')::time >= (v_item->>'end_time')::time THEN
        RAISE EXCEPTION 'invalid_time_range'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
    SELECT count(DISTINCT s.id)
    INTO v_distinct_services
    FROM public.services s
    WHERE s.company_id = v_company_id
      AND s.deleted_at IS NULL
      AND s.active = true
      AND s.id = ANY (p_service_ids);

    IF v_distinct_services <> (
      SELECT count(DISTINCT unnest_id)
      FROM unnest(p_service_ids) AS unnest_id
    ) THEN
      RAISE EXCEPTION 'invalid_service_ids'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.employees (
    company_id,
    name,
    phone,
    email,
    job_title,
    notes,
    active,
    can_be_scheduled,
    created_by
  ) VALUES (
    v_company_id,
    v_name,
    v_phone,
    v_email,
    v_job_title,
    v_notes,
    coalesce(p_active, true),
    coalesce(p_can_be_scheduled, true),
    v_user_id
  )
  RETURNING id INTO v_employee_id;

  IF p_service_ids IS NOT NULL THEN
    FOREACH v_service_id IN ARRAY p_service_ids
    LOOP
      INSERT INTO public.employee_services (company_id, employee_id, service_id)
      VALUES (v_company_id, v_employee_id, v_service_id);
    END LOOP;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    INSERT INTO public.employee_working_hours (
      company_id,
      employee_id,
      weekday,
      enabled,
      start_time,
      end_time
    ) VALUES (
      v_company_id,
      v_employee_id,
      (v_item->>'weekday')::smallint,
      coalesce((v_item->>'enabled')::boolean, false),
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
        THEN (v_item->>'start_time')::time
        ELSE NULL
      END,
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
        THEN (v_item->>'end_time')::time
        ELSE NULL
      END
    );
  END LOOP;

  RETURN v_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.update_employee_with_schedule(
  p_employee_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_job_title text,
  p_notes text,
  p_active boolean,
  p_can_be_scheduled boolean,
  p_service_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_working_hours jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_name text;
  v_phone text;
  v_email text;
  v_job_title text;
  v_notes text;
  v_item jsonb;
  v_weekday smallint;
  v_service_id uuid;
  v_distinct_services integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

    v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL OR NOT private.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'company_membership_required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.company_id = v_company_id
      AND e.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'employee_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_name := trim(p_name);
  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_job_title := nullif(trim(coalesce(p_job_title, '')), '');
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND (char_length(v_phone) < 10 OR char_length(v_phone) > 11) THEN
    RAISE EXCEPTION 'invalid_phone'
      USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL AND char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email'
      USING ERRCODE = '22023';
  END IF;

  IF v_job_title IS NOT NULL AND char_length(v_job_title) > 80 THEN
    RAISE EXCEPTION 'invalid_job_title'
      USING ERRCODE = '22023';
  END IF;

  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'invalid_notes'
      USING ERRCODE = '22023';
  END IF;

  IF p_working_hours IS NULL OR jsonb_typeof(p_working_hours) <> 'array' THEN
    RAISE EXCEPTION 'invalid_working_hours'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    v_weekday := (v_item->>'weekday')::smallint;

    IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
      RAISE EXCEPTION 'invalid_weekday'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce((v_item->>'enabled')::boolean, false) THEN
      IF (v_item->>'start_time') IS NULL OR (v_item->>'end_time') IS NULL THEN
        RAISE EXCEPTION 'missing_working_hours'
          USING ERRCODE = '22023';
      END IF;

      IF (v_item->>'start_time')::time >= (v_item->>'end_time')::time THEN
        RAISE EXCEPTION 'invalid_time_range'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
    SELECT count(DISTINCT s.id)
    INTO v_distinct_services
    FROM public.services s
    WHERE s.company_id = v_company_id
      AND s.deleted_at IS NULL
      AND s.active = true
      AND s.id = ANY (p_service_ids);

    IF v_distinct_services <> (
      SELECT count(DISTINCT unnest_id)
      FROM unnest(p_service_ids) AS unnest_id
    ) THEN
      RAISE EXCEPTION 'invalid_service_ids'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.employees
  SET
    name = v_name,
    phone = v_phone,
    email = v_email,
    job_title = v_job_title,
    notes = v_notes,
    active = coalesce(p_active, true),
    can_be_scheduled = coalesce(p_can_be_scheduled, true)
  WHERE id = p_employee_id
    AND company_id = v_company_id
    AND deleted_at IS NULL;

  DELETE FROM public.employee_services
  WHERE employee_id = p_employee_id
    AND company_id = v_company_id;

  IF p_service_ids IS NOT NULL THEN
    FOREACH v_service_id IN ARRAY p_service_ids
    LOOP
      INSERT INTO public.employee_services (company_id, employee_id, service_id)
      VALUES (v_company_id, p_employee_id, v_service_id);
    END LOOP;
  END IF;

  DELETE FROM public.employee_working_hours
  WHERE employee_id = p_employee_id
    AND company_id = v_company_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_working_hours)
  LOOP
    INSERT INTO public.employee_working_hours (
      company_id,
      employee_id,
      weekday,
      enabled,
      start_time,
      end_time
    ) VALUES (
      v_company_id,
      p_employee_id,
      (v_item->>'weekday')::smallint,
      coalesce((v_item->>'enabled')::boolean, false),
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
        THEN (v_item->>'start_time')::time
        ELSE NULL
      END,
      CASE
        WHEN coalesce((v_item->>'enabled')::boolean, false)
        THEN (v_item->>'end_time')::time
        ELSE NULL
      END
    );
  END LOOP;

  RETURN p_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.grant_employee_access(
  p_employee_id uuid,
  p_email text,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_actor uuid;
  v_company_id uuid;
  v_email text;
  v_target_user_id uuid;
  v_permissions jsonb;
  v_existing_user_id uuid;
BEGIN
  PERFORM private.expire_stale_member_invites();

  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

    v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL OR NOT private.is_company_owner_or_admin(v_company_id) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.company_id = v_company_id
      AND e.deleted_at IS NULL
      AND e.active = true
  ) THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT e.user_id
  INTO v_existing_user_id
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.company_id = v_company_id;

  v_email := lower(trim(p_email));

  IF char_length(v_email) < 3 OR char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  IF p_access_profile NOT IN (
    'manager', 'reception', 'operational', 'finance', 'inventory_cash'
  ) THEN
    RAISE EXCEPTION 'invalid_access_profile' USING ERRCODE = '22023';
  END IF;

  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_permissions' USING ERRCODE = '22023';
  END IF;

  v_permissions := p_permissions;

  -- Somente contas com e-mail confirmado podem ser vinculadas na hora.
  -- Usuários criados por invite (ainda sem confirmação) NÃO contam aqui.
  SELECT u.id
  INTO v_target_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_email
    AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;

  IF v_existing_user_id IS NOT NULL
     AND v_target_user_id IS NOT NULL
     AND v_existing_user_id <> v_target_user_id THEN
    RAISE EXCEPTION 'employee_already_linked' USING ERRCODE = '23505';
  END IF;

  IF v_target_user_id IS NULL THEN
    INSERT INTO public.company_member_invites (
      company_id,
      employee_id,
      email,
      access_profile,
      permissions,
      own_schedule_only,
      invited_by,
      status
    ) VALUES (
      v_company_id,
      p_employee_id,
      v_email,
      p_access_profile,
      v_permissions,
      coalesce(p_own_schedule_only, false),
      v_actor,
      'pending'
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.company_member_invites cmi
    SET
      email = v_email,
      access_profile = p_access_profile,
      permissions = v_permissions,
      own_schedule_only = coalesce(p_own_schedule_only, false),
      invited_by = v_actor,
      status = 'pending',
      revoked_at = NULL,
      expires_at = now() + interval '14 days',
      created_at = now()
    WHERE cmi.company_id = v_company_id
      AND cmi.employee_id = p_employee_id
      AND cmi.status = 'pending';

    -- Reabre convite se um grant anterior marcou accepted por engano (usuário Auth
    -- convidado mas ainda não confirmado / sem senha útil).
    IF NOT EXISTS (
      SELECT 1
      FROM public.company_member_invites cmi
      WHERE cmi.company_id = v_company_id
        AND cmi.employee_id = p_employee_id
        AND cmi.status = 'pending'
    ) THEN
      UPDATE public.company_member_invites cmi
      SET
        email = v_email,
        access_profile = p_access_profile,
        permissions = v_permissions,
        own_schedule_only = coalesce(p_own_schedule_only, false),
        invited_by = v_actor,
        status = 'pending',
        accepted_at = NULL,
        revoked_at = NULL,
        expires_at = now() + interval '14 days',
        created_at = now()
      WHERE cmi.id = (
        SELECT cmi2.id
        FROM public.company_member_invites cmi2
        WHERE cmi2.company_id = v_company_id
          AND cmi2.employee_id = p_employee_id
        ORDER BY cmi2.created_at DESC
        LIMIT 1
      );
    END IF;

    -- Se um grant anterior vinculou membership cedo demais (usuário sem confirmação),
    -- remove o vínculo prematuro para o funcionário poder aceitar de novo.
    DELETE FROM public.company_members cm
    WHERE cm.company_id = v_company_id
      AND cm.employee_id = p_employee_id
      AND cm.role = 'staff'
      AND NOT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = cm.user_id
          AND u.email_confirmed_at IS NOT NULL
      );

    UPDATE public.employees e
    SET user_id = NULL
    WHERE e.id = p_employee_id
      AND e.company_id = v_company_id
      AND e.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = e.user_id
          AND u.email_confirmed_at IS NOT NULL
      );

    RETURN jsonb_build_object(
      'status', 'invite_pending',
      'email', v_email,
      'email_delivery', 'pending_app_send'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = v_company_id
      AND cm.user_id = v_target_user_id
      AND cm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'cannot_modify_owner_access' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.company_members (
    company_id,
    user_id,
    role,
    access_profile,
    permissions,
    employee_id,
    own_schedule_only,
    access_revoked_at
  ) VALUES (
    v_company_id,
    v_target_user_id,
    'staff',
    p_access_profile,
    v_permissions,
    p_employee_id,
    coalesce(p_own_schedule_only, false),
    NULL
  )
  ON CONFLICT (company_id, user_id) DO UPDATE
  SET
    access_profile = EXCLUDED.access_profile,
    permissions = EXCLUDED.permissions,
    employee_id = EXCLUDED.employee_id,
    own_schedule_only = EXCLUDED.own_schedule_only,
    access_revoked_at = NULL,
    updated_at = now()
  WHERE public.company_members.role <> 'owner';

  UPDATE public.employees e
  SET
    user_id = v_target_user_id,
    email = coalesce(e.email, v_email)
  WHERE e.id = p_employee_id
    AND e.company_id = v_company_id
    AND (e.user_id IS NULL OR e.user_id = v_target_user_id);

  UPDATE public.company_member_invites cmi
  SET
    status = 'accepted',
    accepted_at = now()
  WHERE cmi.company_id = v_company_id
    AND cmi.employee_id = p_employee_id
    AND cmi.status = 'pending';

  RETURN jsonb_build_object(
    'status', 'linked',
    'user_id', v_target_user_id,
    'email', v_email,
    'email_delivery', 'not_needed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.update_employee_access(
  p_employee_id uuid,
  p_access_profile text,
  p_permissions jsonb,
  p_own_schedule_only boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_actor uuid;
  v_company_id uuid;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

    v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL OR NOT private.is_company_owner_or_admin(v_company_id) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_access_profile NOT IN (
    'manager', 'reception', 'operational', 'finance', 'inventory_cash'
  ) THEN
    RAISE EXCEPTION 'invalid_access_profile' USING ERRCODE = '22023';
  END IF;

  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_permissions' USING ERRCODE = '22023';
  END IF;

  UPDATE public.company_members cm
  SET
    access_profile = p_access_profile,
    permissions = p_permissions,
    own_schedule_only = coalesce(p_own_schedule_only, false),
    updated_at = now()
  WHERE cm.company_id = v_company_id
    AND cm.employee_id = p_employee_id
    AND cm.access_revoked_at IS NULL
    AND cm.role <> 'owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_access_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.revoke_employee_access(p_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_actor uuid;
  v_company_id uuid;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

    v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL OR NOT private.is_company_owner_or_admin(v_company_id) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.company_members cm
  SET
    access_revoked_at = now(),
    updated_at = now()
  WHERE cm.company_id = v_company_id
    AND cm.employee_id = p_employee_id
    AND cm.access_revoked_at IS NULL
    AND cm.role <> 'owner';

  UPDATE public.company_member_invites cmi
  SET
    status = 'revoked',
    revoked_at = now()
  WHERE cmi.company_id = v_company_id
    AND cmi.employee_id = p_employee_id
    AND cmi.status = 'pending';

  UPDATE public.employees e
  SET user_id = NULL
  WHERE e.id = p_employee_id
    AND e.company_id = v_company_id;
END;
$$;


-- complete_onboarding: membership existente (ativa ou revogada) impede criar outra empresa
CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_full_name text,
  p_company_name text,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_existing_company_id uuid;
  v_full_name text;
  v_company_name text;
  v_phone text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;

  v_full_name := trim(p_full_name);
  v_company_name := trim(p_company_name);
  v_phone := NULLIF(trim(p_phone), '');

  IF char_length(v_full_name) < 2 OR char_length(v_full_name) > 120 THEN
    RAISE EXCEPTION 'invalid_full_name'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(v_company_name) < 2 OR char_length(v_company_name) > 120 THEN
    RAISE EXCEPTION 'invalid_company_name'
      USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND v_phone !~ '^\+55[1-9][0-9]{9,10}$' THEN
    RAISE EXCEPTION 'invalid_phone'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (v_user_id, v_full_name, v_phone)
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();

  SELECT cm.company_id
  INTO v_existing_company_id
  FROM public.company_members cm
  WHERE cm.user_id = v_user_id
  ORDER BY (cm.access_revoked_at IS NULL) DESC, cm.updated_at DESC NULLS LAST, cm.created_at ASC
  LIMIT 1;

  IF v_existing_company_id IS NOT NULL THEN
    RETURN v_existing_company_id;
  END IF;

  INSERT INTO public.companies (name, created_by)
  VALUES (v_company_name, v_user_id)
  RETURNING id INTO v_company_id;

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (v_company_id, v_user_id, 'owner');

  RETURN v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_onboarding_tutorial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
SET row_security = off
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_active_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_company_id := private.get_auth_company_id();

  IF v_company_id IS NULL THEN
    SELECT count(*)
    INTO v_active_count
    FROM public.company_members cm
    WHERE cm.user_id = v_user_id
      AND cm.access_revoked_at IS NULL;

    IF v_active_count = 1 THEN
      SELECT cm.company_id
      INTO v_company_id
      FROM public.company_members cm
      WHERE cm.user_id = v_user_id
        AND cm.access_revoked_at IS NULL;
    ELSE
      RETURN;
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    onboarding_tutorial_completed_at = coalesce(onboarding_tutorial_completed_at, now()),
    updated_at = now()
  WHERE id = v_user_id;

  IF v_company_id IS NOT NULL THEN
    PERFORM public.upsert_onboarding_progress(
      v_company_id,
      jsonb_build_object(
        'welcome_seen', true,
        'guided_active', false,
        'completed', true,
        'checklist_dismissed', true
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding_tutorial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_tutorial() TO authenticated;


-- ---------------------------------------------------------------------------
-- Fail-closed: p_company_id omitted still denied; revoke helper EXECUTE
-- Rewrite leftover private RPCs that inferred tenant by created_at
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION private.get_auth_company_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.activate_company_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.require_app_permission(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.profile_default_permissions(text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  def text;
  newdef text;
  fn oid;
BEGIN
  SELECT p.oid
  INTO fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'register_stock_movement';

  IF fn IS NULL THEN
    RAISE EXCEPTION 'private.register_stock_movement not found after schema move';
  END IF;

  def := pg_get_functiondef(fn);

  IF def ~* 'ORDER BY[[:space:]]+cm\.created_at' THEN
    newdef := regexp_replace(
      def,
      'SELECT[[:space:]]+cm\.company_id[[:space:]]+INTO[[:space:]]+v_company_id[[:space:]]+FROM[[:space:]]+public\.company_members[[:space:]]+cm[[:space:]]+WHERE[[:space:]]+cm\.user_id[[:space:]]*=[[:space:]]+v_user_id[[:space:]]+ORDER BY[[:space:]]+cm\.created_at[[:space:]]+ASC[[:space:]]+LIMIT[[:space:]]+1;',
      'v_company_id := private.get_auth_company_id();',
      'i'
    );

    IF newdef = def THEN
      RAISE EXCEPTION 'failed to rewrite private.register_stock_movement tenant lookup';
    END IF;

    EXECUTE newdef;
  END IF;
END;
$$;

DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.proname)
  INTO leftover
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private')
    AND p.proname NOT IN ('complete_onboarding', 'complete_onboarding_tutorial')
    AND pg_get_functiondef(p.oid) ~* 'ORDER BY[[:space:]]+(cm\.)?created_at[[:space:]]+ASC[[:space:]]+LIMIT[[:space:]]+1';

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'functions still infer tenant by created_at LIMIT 1: %', leftover;
  END IF;
END;
$$;
