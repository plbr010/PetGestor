-- PetGestor — criar conta demo completa via SQL Editor (Supabase)
--
-- Uso:
--   1. Cole este arquivo inteiro no SQL Editor do Supabase
--   2. Execute (Run)
--   3. Entre em /entrar com:
--        E-mail: mariana+demo@demo.petgestor.app
--        Senha:  PetGestorDemo2026!
--
-- Para recriar do zero (apaga empresa demo existente):
--   SELECT public.seed_demo_account(true);
--
-- Idempotente: se os dados já existirem, não duplica (retorna skipped).
--
-- Requer: migrations do PetGestor aplicadas + extensão pgcrypto.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Impersona usuário autenticado (para RPCs que usam auth.uid())
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.seed_demo_set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

REVOKE ALL ON FUNCTION private.seed_demo_set_auth(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Cria usuário auth (e-mail/senha) se ainda não existir
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.seed_demo_ensure_user(
  p_email text,
  p_password text,
  p_full_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT u.id
  INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    RETURN v_user_id;
  END IF;

  v_user_id := private.deterministic_uuid('petgestor-demo:owner');

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', p_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    p_email,
    now(),
    now(),
    now()
  );

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION private.seed_demo_ensure_user(text, text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Próximo dia útil (seg–sáb) com horário comercial ainda no futuro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.seed_demo_next_business_date(p_timezone text)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public, private, auth
AS $$
DECLARE
  v_attempt integer;
  v_candidate date;
  v_weekday integer;
  v_first_slot timestamptz;
BEGIN
  FOR v_attempt IN 0..21 LOOP
    v_candidate := (now() AT TIME ZONE p_timezone)::date + v_attempt;
    v_weekday := EXTRACT(DOW FROM v_candidate)::integer;

    IF v_weekday = 0 THEN
      CONTINUE;
    END IF;

    v_first_slot := (v_candidate + time '08:30') AT TIME ZONE p_timezone;

    IF v_first_slot > now() THEN
      RETURN v_candidate;
    END IF;
  END LOOP;

  RETURN (now() AT TIME ZONE p_timezone)::date + 1;
END;
$$;

REVOKE ALL ON FUNCTION private.seed_demo_next_business_date(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.seed_demo_at_local_time(
  p_timezone text,
  p_local_date date,
  p_local_time time
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public, private, auth
AS $$
  SELECT (p_local_date + p_local_time) AT TIME ZONE p_timezone;
$$;

REVOKE ALL ON FUNCTION private.seed_demo_at_local_time(text, date, time) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Seed principal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_demo_account(p_reseed boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
SET row_security = off
AS $$
DECLARE
  v_email constant text := 'mariana+demo@demo.petgestor.app';
  v_password constant text := 'PetGestorDemo2026!';
  v_owner constant text := 'Mariana';
  v_company_name constant text := 'Pet Shop Amigo Fiel';
  v_phone constant text := '+5511987654321';
  v_timezone constant text := 'America/Sao_Paulo';

  v_user_id uuid;
  v_company_id uuid;

  -- Tutores
  v_cust_ana uuid;
  v_cust_carlos uuid;
  v_cust_juliana uuid;
  v_cust_roberto uuid;
  v_cust_fernanda uuid;

  -- Pets
  v_pet_thor uuid;
  v_pet_luna uuid;
  v_pet_mel uuid;
  v_pet_bob uuid;
  v_pet_nina uuid;

  -- Serviços
  v_svc_banho uuid;
  v_svc_consulta uuid;
  v_svc_hidratacao uuid;
  v_svc_tosa uuid;

  -- Equipe
  v_emp_rafaela uuid;
  v_emp_pedro uuid;
  v_emp_camila uuid;

  -- Estoque
  v_cat_higiene uuid;
  v_cat_alimentacao uuid;
  v_cat_acessorios uuid;
  v_sup_petmax uuid;
  v_prod_shampoo uuid;
  v_prod_condicionador uuid;
  v_prod_racao uuid;
  v_prod_coleira uuid;

  -- Pacotes
  v_package_id uuid;

  -- Agenda
  v_apt1 uuid;
  v_apt2 uuid;
  v_apt3 uuid;
  v_apt4 uuid;
  v_apt5 uuid;
  v_recurrence_id uuid;
  v_order_id uuid;
  v_schedule_date date;

  v_customer_count integer;
  v_now timestamptz := now();
BEGIN
  -- Recriar do zero: apaga empresa demo (cascade)
  IF p_reseed THEN
    DELETE FROM public.companies c
    USING auth.users u
    JOIN public.company_members cm ON cm.user_id = u.id AND cm.role = 'owner'
    WHERE cm.company_id = c.id
      AND lower(u.email) = lower(v_email);

    DELETE FROM auth.users u
    WHERE lower(u.email) = lower(v_email)
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members cm WHERE cm.user_id = u.id
      );
  END IF;

  v_user_id := private.seed_demo_ensure_user(v_email, v_password, v_owner);
  PERFORM private.seed_demo_set_auth(v_user_id);

  SELECT cm.company_id
  INTO v_company_id
  FROM public.company_members cm
  WHERE cm.user_id = v_user_id
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    v_company_id := public.complete_onboarding(v_owner, v_company_name, v_phone);
  END IF;

  UPDATE public.companies
  SET timezone = v_timezone
  WHERE id = v_company_id;

  UPDATE public.company_subscriptions
  SET
    status = 'trialing',
    trial_ends_at = v_now + interval '365 days'
  WHERE company_id = v_company_id;

  SELECT count(*)::integer
  INTO v_customer_count
  FROM public.customers c
  WHERE c.company_id = v_company_id
    AND c.deleted_at IS NULL;

  IF v_customer_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'message', 'Conta demo já possui dados. Use SELECT public.seed_demo_account(true); para recriar.',
      'email', v_email,
      'password', v_password,
      'company_id', v_company_id,
      'user_id', v_user_id
    );
  END IF;

  -- Tutores
  INSERT INTO public.customers (company_id, created_by, name, phone, email, notes)
  VALUES
    (v_company_id, v_user_id, 'Ana Silva', '11999887766', 'ana.silva@email.com', 'Cliente desde 2023. Prefere agendamentos pela manhã.')
  RETURNING id INTO v_cust_ana;

  INSERT INTO public.customers (company_id, created_by, name, phone, email, notes)
  VALUES
    (v_company_id, v_user_id, 'Carlos Mendes', '11988776655', 'carlos.mendes@email.com', 'Traz a Luna para consultas veterinárias mensais.')
  RETURNING id INTO v_cust_carlos;

  INSERT INTO public.customers (company_id, created_by, name, phone, email, notes)
  VALUES
    (v_company_id, v_user_id, 'Juliana Costa', '11977665544', 'juliana.costa@email.com', NULL)
  RETURNING id INTO v_cust_juliana;

  INSERT INTO public.customers (company_id, created_by, name, phone, email, notes)
  VALUES
    (v_company_id, v_user_id, 'Roberto Lima', '11966554433', NULL, 'Sempre pede tosa higiênica no Bob.')
  RETURNING id INTO v_cust_roberto;

  INSERT INTO public.customers (company_id, created_by, name, phone, email, notes)
  VALUES
    (v_company_id, v_user_id, 'Fernanda Alves', '11955443322', 'fernanda.alves@email.com', 'Comprou pacote de banhos para a Nina.')
  RETURNING id INTO v_cust_fernanda;

  -- Pets
  INSERT INTO public.pets (
    company_id, customer_id, created_by, name, species, breed, sex,
    weight_kg, color, allergies, notes, important_notes
  ) VALUES (
    v_company_id, v_cust_ana, v_user_id, 'Thor', 'dog', 'Golden Retriever', 'male',
    32.5, 'Dourado', 'Nenhuma conhecida', 'Muito dócil. Gosta de banho morno.',
    'Vacinas em dia. Vermífugo aplicado em jan/2026.'
  ) RETURNING id INTO v_pet_thor;

  INSERT INTO public.pets (
    company_id, customer_id, created_by, name, species, breed, sex,
    weight_kg, color, allergies, notes, important_notes
  ) VALUES (
    v_company_id, v_cust_carlos, v_user_id, 'Luna', 'dog', 'SRD', 'female',
    12.0, 'Caramelo', NULL, NULL,
    'Histórico de alergia a shampoo com perfume forte.'
  ) RETURNING id INTO v_pet_luna;

  INSERT INTO public.pets (
    company_id, customer_id, created_by, name, species, breed, sex,
    weight_kg, color, allergies, notes, important_notes
  ) VALUES (
    v_company_id, v_cust_juliana, v_user_id, 'Mel', 'dog', 'Poodle', 'female',
    6.8, 'Branco', NULL, 'Pelagem sensível.', NULL
  ) RETURNING id INTO v_pet_mel;

  INSERT INTO public.pets (
    company_id, customer_id, created_by, name, species, breed, sex,
    weight_kg, color, allergies, notes, important_notes
  ) VALUES (
    v_company_id, v_cust_roberto, v_user_id, 'Bob', 'dog', 'Bulldog Francês', 'male',
    11.2, 'Tigrado', 'Calor intenso', NULL,
    'Branquicefálico — evitar esforço no calor.'
  ) RETURNING id INTO v_pet_bob;

  INSERT INTO public.pets (
    company_id, customer_id, created_by, name, species, breed, sex,
    weight_kg, color, allergies, notes, important_notes
  ) VALUES (
    v_company_id, v_cust_fernanda, v_user_id, 'Nina', 'cat', 'Persa', 'female',
    4.5, 'Cinza', NULL, 'Gata de interior.', NULL
  ) RETURNING id INTO v_pet_nina;

  -- Serviços
  v_svc_banho := public.create_service_with_prices(
    'Banho e tosa'::text,
    'Banho completo com tosa higiênica e secagem.'::text,
    'by_size'::text,
    NULL,
    90,
    true,
    '[
      {"size":"small","price_cents":8500,"duration_minutes":75},
      {"size":"medium","price_cents":10500,"duration_minutes":90},
      {"size":"large","price_cents":13500,"duration_minutes":105},
      {"size":"giant","price_cents":16500,"duration_minutes":120}
    ]'::jsonb
  );

  v_svc_consulta := public.create_service_with_prices(
    'Consulta veterinária'::text,
    'Avaliação clínica com profissional parceiro.'::text,
    'fixed'::text,
    12000,
    45,
    true,
    NULL
  );

  v_svc_hidratacao := public.create_service_with_prices(
    'Hidratação'::text,
    'Máscara hidratante para pelos ressecados.'::text,
    'fixed'::text,
    6500,
    30,
    true,
    NULL
  );

  v_svc_tosa := public.create_service_with_prices(
    'Tosa higiênica'::text,
    'Tosa nas áreas íntimas, patas e focinho.'::text,
    'fixed'::text,
    5500,
    40,
    true,
    NULL
  );

  -- Equipe
  v_emp_rafaela := public.create_employee_with_schedule(
    'Rafaela Souza', '11991234567', 'rafaela@amigofiel.local', 'Tosadora', NULL,
    true, true,
    ARRAY[v_svc_banho, v_svc_hidratacao, v_svc_tosa],
    '[
      {"weekday":0,"enabled":false,"start_time":null,"end_time":null},
      {"weekday":1,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":2,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":3,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":4,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":5,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":6,"enabled":true,"start_time":"08:00","end_time":"13:00"}
    ]'::jsonb
  );

  v_emp_pedro := public.create_employee_with_schedule(
    'Pedro Henrique', '11992345678', 'pedro@amigofiel.local', 'Banhista', NULL,
    true, true,
    ARRAY[v_svc_banho, v_svc_hidratacao, v_svc_consulta],
    '[
      {"weekday":0,"enabled":false,"start_time":null,"end_time":null},
      {"weekday":1,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":2,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":3,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":4,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":5,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":6,"enabled":true,"start_time":"08:00","end_time":"13:00"}
    ]'::jsonb
  );

  v_emp_camila := public.create_employee_with_schedule(
    'Camila Rocha', '11993456789', 'camila@amigofiel.local', 'Recepcionista', NULL,
    true, false,
    ARRAY[v_svc_consulta],
    '[
      {"weekday":0,"enabled":false,"start_time":null,"end_time":null},
      {"weekday":1,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":2,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":3,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":4,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":5,"enabled":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":6,"enabled":true,"start_time":"08:00","end_time":"13:00"}
    ]'::jsonb
  );

  -- Estoque
  INSERT INTO public.product_categories (company_id, name, created_by)
  VALUES (v_company_id, 'Higiene', v_user_id) RETURNING id INTO v_cat_higiene;
  INSERT INTO public.product_categories (company_id, name, created_by)
  VALUES (v_company_id, 'Alimentação', v_user_id) RETURNING id INTO v_cat_alimentacao;
  INSERT INTO public.product_categories (company_id, name, created_by)
  VALUES (v_company_id, 'Acessórios', v_user_id) RETURNING id INTO v_cat_acessorios;

  INSERT INTO public.inventory_suppliers (company_id, name, phone, email, notes, created_by)
  VALUES (v_company_id, 'PetMax Distribuidora', '1133334444', 'vendas@petmax.com.br', 'Entrega às terças e quintas.', v_user_id)
  RETURNING id INTO v_sup_petmax;

  INSERT INTO public.inventory_suppliers (company_id, name, phone, email, notes, created_by)
  VALUES (v_company_id, 'AgroPet Sul', '1144445555', NULL, NULL, v_user_id);

  INSERT INTO public.products (
    company_id, name, sku, category_id, unit, cost_price_cents, sale_price_cents,
    current_stock, minimum_stock, active, track_stock, created_by
  ) VALUES (
    v_company_id, 'Shampoo Neutro 500ml', 'SHP-NEU-500', v_cat_higiene, 'unit',
    1800, 3200, 0, 5, true, true, v_user_id
  ) RETURNING id INTO v_prod_shampoo;

  INSERT INTO public.products (
    company_id, name, sku, category_id, unit, cost_price_cents, sale_price_cents,
    current_stock, minimum_stock, active, track_stock, created_by
  ) VALUES (
    v_company_id, 'Condicionador Hidratante 500ml', 'CND-HID-500', v_cat_higiene, 'unit',
    2200, 3800, 0, 4, true, true, v_user_id
  ) RETURNING id INTO v_prod_condicionador;

  INSERT INTO public.products (
    company_id, name, sku, category_id, unit, cost_price_cents, sale_price_cents,
    current_stock, minimum_stock, active, track_stock, created_by
  ) VALUES (
    v_company_id, 'Ração Premium 10kg', 'RAC-PRM-10', v_cat_alimentacao, 'unit',
    14500, 18900, 0, 3, true, true, v_user_id
  ) RETURNING id INTO v_prod_racao;

  INSERT INTO public.products (
    company_id, name, sku, category_id, unit, cost_price_cents, sale_price_cents,
    current_stock, minimum_stock, active, track_stock, created_by
  ) VALUES (
    v_company_id, 'Coleira Ajustável M', 'COL-AJU-M', v_cat_acessorios, 'unit',
    1200, 2490, 0, 6, true, true, v_user_id
  ) RETURNING id INTO v_prod_coleira;

  PERFORM public.register_stock_movement(v_prod_shampoo, 'entry'::text, 24, gen_random_uuid(), 1800, 'purchase'::text, 'Estoque inicial demo', v_sup_petmax, 'LOTE-DEMO-SHP', NULL, NULL, NULL, NULL);
  PERFORM public.register_stock_movement(v_prod_condicionador, 'entry'::text, 18, gen_random_uuid(), 2200, 'purchase'::text, 'Estoque inicial demo', v_sup_petmax, 'LOTE-DEMO-CND', NULL, NULL, NULL, NULL);
  PERFORM public.register_stock_movement(v_prod_racao, 'entry'::text, 12, gen_random_uuid(), 14500, 'purchase'::text, 'Estoque inicial demo', v_sup_petmax, 'LOTE-DEMO-RAC', NULL, NULL, NULL, NULL);
  PERFORM public.register_stock_movement(v_prod_coleira, 'entry'::text, 3, gen_random_uuid(), 1200, 'purchase'::text, 'Estoque inicial demo', v_sup_petmax, 'LOTE-DEMO-COL', NULL, NULL, NULL, NULL);

  PERFORM public.replace_service_product_recipes(
    v_svc_banho,
    jsonb_build_array(
      jsonb_build_object('product_id', v_prod_shampoo, 'quantity', 0.05),
      jsonb_build_object('product_id', v_prod_condicionador, 'quantity', 0.03)
    )
  );

  -- Pacote de serviços
  v_package_id := public.create_service_package_with_items(
    'Pacote 4 Banhos',
    'Quatro banhos com desconto — válido por 90 dias.',
    32000,
    90,
    true,
    jsonb_build_array(jsonb_build_object('service_id', v_svc_banho, 'quantity', 4))
  );

  PERFORM public.sell_customer_service_package(
    p_package_id => v_package_id,
    p_customer_id => v_cust_fernanda,
    p_pet_id => v_pet_nina,
    p_starts_at => (v_now AT TIME ZONE v_timezone)::date,
    p_financial_status => 'paid'::text,
    p_payment_method => 'credit_card'::text
  );

  -- Agenda (horários dentro do expediente 08:00–18:00, seg–sáb)
  v_schedule_date := private.seed_demo_next_business_date(v_timezone);

  v_apt1 := public.create_appointment(
    v_pet_thor, v_svc_banho, v_emp_rafaela,
    private.seed_demo_at_local_time(v_timezone, v_schedule_date, time '08:30'),
    'large'::text, 'Agendamento demonstrativo'::text
  );
  v_apt2 := public.create_appointment(
    v_pet_luna, v_svc_consulta, v_emp_pedro,
    private.seed_demo_at_local_time(v_timezone, v_schedule_date, time '10:00'),
    'medium'::text, 'Agendamento demonstrativo'::text
  );
  v_apt3 := public.create_appointment(
    v_pet_mel, v_svc_hidratacao, v_emp_pedro,
    private.seed_demo_at_local_time(v_timezone, v_schedule_date, time '11:30'),
    'small'::text, 'Agendamento demonstrativo'::text
  );
  v_apt4 := public.create_appointment(
    v_pet_bob, v_svc_tosa, v_emp_rafaela,
    private.seed_demo_at_local_time(v_timezone, v_schedule_date, time '14:00'),
    'medium'::text, 'Agendamento demonstrativo'::text
  );
  v_apt5 := public.create_appointment(
    v_pet_nina, v_svc_banho, v_emp_pedro,
    private.seed_demo_at_local_time(v_timezone, v_schedule_date, time '16:00'),
    'small'::text, 'Agendamento demonstrativo'::text
  );

  -- Recorrência semanal (Thor)
  INSERT INTO public.appointment_recurrences (
    company_id, frequency, interval_value, max_occurrences, created_by, active
  ) VALUES (
    v_company_id, 'weekly', 1, 3, v_user_id, true
  ) RETURNING id INTO v_recurrence_id;

  -- Lista de espera
  INSERT INTO public.appointment_waitlist (
    company_id, customer_id, pet_id, service_id, preferred_employee_id,
    preferred_date, preferred_period, notes, created_by
  ) VALUES (
    v_company_id, v_cust_roberto, v_pet_bob, v_svc_tosa, v_emp_rafaela,
    v_schedule_date + 3,
    'morning',
    'Lista de espera demo — cliente flexível no horário.',
    v_user_id
  );

  -- Bloqueio de horário (almoço)
  INSERT INTO public.schedule_time_blocks (
    company_id, employee_id, block_start, block_end, reason, created_by
  ) VALUES (
    v_company_id,
    v_emp_rafaela,
    private.seed_demo_at_local_time(v_timezone, v_schedule_date, time '12:00'),
    private.seed_demo_at_local_time(v_timezone, v_schedule_date, time '13:00'),
    'Almoço / pausa demonstrativa',
    v_user_id
  );

  -- Atendimentos em diferentes estágios
  v_order_id := public.check_in_appointment(v_apt1, 'Check-in demo — aguardando banho.');

  v_order_id := public.check_in_appointment(v_apt2, 'Consulta em andamento.');
  PERFORM public.start_service_order(v_order_id);

  v_order_id := public.check_in_appointment(v_apt3, 'Hidratação quase finalizada.');
  PERFORM public.start_service_order(v_order_id);
  PERFORM public.mark_service_order_ready(v_order_id);

  v_order_id := public.check_in_appointment(v_apt4, NULL);
  PERFORM public.start_service_order(v_order_id);
  PERFORM public.mark_service_order_ready(v_order_id);
  PERFORM public.complete_service_order(v_order_id, 'Entrega concluída — demo.');

  -- Financeiro manual
  INSERT INTO public.financial_entries (
    company_id, entry_type, status, source_type, description, category,
    amount_cents, payment_method, paid_at, created_by
  ) VALUES
    (v_company_id, 'income', 'paid', 'manual', 'Venda balcão — ração e acessórios', 'PDV', 21390, 'pix', v_now, v_user_id),
    (v_company_id, 'income', 'paid', 'manual', 'Pacote 4 banhos — Fernanda', 'Pacotes', 32000, 'credit_card', v_now, v_user_id),
    (v_company_id, 'income', 'pending', 'manual', 'Banho Thor — pendente', 'Serviços', 13500, NULL, NULL, v_user_id),
    (v_company_id, 'expense', 'paid', 'manual', 'Reposição de shampoos e condicionadores', 'Estoque', 89000, 'bank_transfer', v_now, v_user_id),
    (v_company_id, 'expense', 'pending', 'manual', 'Aluguel do ponto — mês atual', 'Fixos', 350000, NULL, NULL, v_user_id);

  -- PDV
  PERFORM public.open_cash_session(15000, 'Abertura de caixa demo');

  PERFORM public.complete_product_sale(
    gen_random_uuid(),
    jsonb_build_array(
      jsonb_build_object('product_id', v_prod_racao, 'quantity', 1, 'unit_price_cents', 18900),
      jsonb_build_object('product_id', v_prod_coleira, 'quantity', 1, 'unit_price_cents', 2490)
    ),
    jsonb_build_array(
      jsonb_build_object('amount_cents', 21390, 'payment_method', 'pix', 'idempotency_key', gen_random_uuid()::text)
    ),
    v_cust_ana,
    NULL, 0, NULL, NULL
  );

  PERFORM public.complete_product_sale(
    gen_random_uuid(),
    jsonb_build_array(
      jsonb_build_object('product_id', v_prod_coleira, 'quantity', 1, 'unit_price_cents', 2490)
    ),
    jsonb_build_array(
      jsonb_build_object('amount_cents', 1000, 'payment_method', 'cash', 'idempotency_key', gen_random_uuid()::text)
    ),
    NULL,
    NULL, 0, NULL, NULL
  );

  -- Notificações e onboarding
  INSERT INTO public.company_notification_settings (
    company_id,
    appointment_confirmation_enabled,
    reminder_24h_enabled,
    reminder_2h_enabled,
    pet_ready_enabled,
    customer_same_day_reminder_enabled,
    employee_same_day_reminder_enabled,
    employee_reminder_2h_enabled,
    same_day_reminder_time
  ) VALUES (
    v_company_id, true, true, true, true, true, true, true, '08:00'
  ) ON CONFLICT (company_id) DO UPDATE SET
    appointment_confirmation_enabled = EXCLUDED.appointment_confirmation_enabled,
    reminder_24h_enabled = EXCLUDED.reminder_24h_enabled,
    reminder_2h_enabled = EXCLUDED.reminder_2h_enabled,
    pet_ready_enabled = EXCLUDED.pet_ready_enabled,
    customer_same_day_reminder_enabled = EXCLUDED.customer_same_day_reminder_enabled,
    employee_same_day_reminder_enabled = EXCLUDED.employee_same_day_reminder_enabled,
    employee_reminder_2h_enabled = EXCLUDED.employee_reminder_2h_enabled,
    same_day_reminder_time = EXCLUDED.same_day_reminder_time;

  PERFORM public.upsert_onboarding_progress(
    v_company_id,
    jsonb_build_object(
      'mark_started', true,
      'welcome_seen', true,
      'guided_started', true,
      'guided_skipped', true,
      'workflow_viewed', true,
      'finance_viewed', true,
      'completed', true,
      'checklist_dismissed', true
    )
  );

  INSERT INTO public.app_notifications (
    company_id, user_id, type, severity, title, message,
    href, required_permission, dedupe_key, is_read
  ) VALUES
    (
      v_company_id, v_user_id, 'stock_low', 'warning',
      'Estoque baixo', 'Coleira Ajustável M está com estoque baixo.',
      '/dashboard/estoque', 'inventory.view',
      'demo:stock_low:' || v_company_id::text, false
    ),
    (
      v_company_id, NULL, 'payment_pending', 'info',
      'Pagamento pendente', 'Há receitas aguardando confirmação de pagamento.',
      '/dashboard/financeiro', 'finance.view',
      'demo:payment_pending:' || v_company_id::text, false
    )
  ON CONFLICT (company_id, dedupe_key) DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'created',
    'message', 'Conta demo criada com sucesso.',
    'email', v_email,
    'password', v_password,
    'company_name', v_company_name,
    'company_id', v_company_id,
    'user_id', v_user_id,
    'login_url', '/entrar'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_account(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_demo_account(boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.seed_demo_account(boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Executar seed
-- ---------------------------------------------------------------------------
SELECT public.seed_demo_account(false);
