-- =============================================================================
-- PetGestor — Auditoria manual de RLS (isolamento multi-tenant)
-- =============================================================================
--
-- USO: executar no Supabase SQL Editor em ambiente de DESENVOLVIMENTO/STAGING.
-- Este script NÃO altera dados permanentemente — termina com ROLLBACK.
-- NÃO desabilita RLS. NÃO usa service_role na aplicação.
--
-- ANTES DE EXECUTAR:
-- 1. Substitua TODOS os placeholders abaixo por UUIDs reais do seu ambiente.
-- 2. Crie Empresa A / Usuário A e Empresa B / Usuário B via onboarding normal.
-- 3. Na Empresa A, crie um tutor e um pet; copie os UUIDs.
--
-- PLACEHOLDERS (substituir):
--   :USER_A_ID          — auth.users.id do Usuário A
--   :USER_B_ID          — auth.users.id do Usuário B
--   :COMPANY_A_ID       — companies.id da Empresa A
--   :COMPANY_B_ID       — companies.id da Empresa B
--   :CUSTOMER_A_ID      — customers.id do tutor "Teste Empresa A"
--   :PET_A_ID           — pets.id do pet "Rex Empresa A"
--   :CUSTOMER_B_ID      — customers.id de um tutor da Empresa B (opcional)
--   :PET_B_ID           — pets.id de um pet da Empresa B (opcional)
--
-- LIMITAÇÃO IMPORTANTE (leia antes de confiar nos resultados):
-- O SQL Editor executa como superuser (postgres). Mesmo com SET ROLE authenticated,
-- a simulação de JWT via set_config('request.jwt.claim.sub', ...) NÃO é idêntica
-- a uma requisição real via PostgREST/Supabase JS com access token.
-- auth.uid() depende do contexto JWT; em alguns ambientes set_config funciona,
-- em outros pode retornar NULL — verifique com o teste 0 abaixo.
-- Testes de interface (duas contas no browser) e chamadas autenticadas via app
-- permanecem a prova definitiva de isolamento end-to-end.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Verificar se auth.uid() responde à simulação (User A)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', ':USER_A_ID', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE NOTICE 'AVISO: auth.uid() retornou NULL — simulação JWT pode ser inválida neste ambiente.';
  ELSE
    RAISE NOTICE 'OK: auth.uid() = %', v_uid;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) SELECT cross-company — User A NÃO deve ver dados da Empresa B
-- ---------------------------------------------------------------------------
SELECT count(*) AS customers_visiveis_user_a
FROM public.customers
WHERE company_id = ':COMPANY_B_ID';
-- Esperado: 0

SELECT count(*) AS pets_visiveis_user_a
FROM public.pets
WHERE company_id = ':COMPANY_B_ID';
-- Esperado: 0

SELECT count(*) AS companies_visiveis_user_a
FROM public.companies
WHERE id = ':COMPANY_B_ID';
-- Esperado: 0

-- Tentativa de ler tutor A por UUID (User A — deve ver 1)
SELECT id, company_id FROM public.customers
WHERE id = ':CUSTOMER_A_ID';
-- Esperado: 1 linha, company_id = :COMPANY_A_ID

-- ---------------------------------------------------------------------------
-- 2) Simular User B tentando ler tutor/pet da Empresa A por UUID
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', ':USER_B_ID', true);

SELECT count(*) AS user_b_ve_tutor_a
FROM public.customers
WHERE id = ':CUSTOMER_A_ID';
-- Esperado: 0

SELECT count(*) AS user_b_ve_pet_a
FROM public.pets
WHERE id = ':PET_A_ID';
-- Esperado: 0

-- ---------------------------------------------------------------------------
-- 3) UPDATE cross-company — User B tentando alterar tutor A
-- ---------------------------------------------------------------------------
UPDATE public.customers
SET name = 'Tentativa invasão'
WHERE id = ':CUSTOMER_A_ID'
  AND company_id = ':COMPANY_A_ID';
-- Esperado: 0 rows (verificar GET DIAGNOSTICS ou row count no editor)

UPDATE public.pets
SET name = 'Tentativa invasão'
WHERE id = ':PET_A_ID'
  AND company_id = ':COMPANY_A_ID';
-- Esperado: 0 rows

-- ---------------------------------------------------------------------------
-- 4) company_id imutável — trigger private.prevent_company_change()
--    Executar como User A (membro da Empresa A)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', ':USER_A_ID', true);

DO $$
BEGIN
  UPDATE public.customers
  SET company_id = ':COMPANY_B_ID'
  WHERE id = ':CUSTOMER_A_ID';
  RAISE EXCEPTION 'FALHA: company_id de customer foi alterado (não deveria)';
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    RAISE NOTICE 'OK: trigger bloqueou alteração de company_id em customers';
END $$;

DO $$
BEGIN
  UPDATE public.pets
  SET company_id = ':COMPANY_B_ID'
  WHERE id = ':PET_A_ID';
  RAISE EXCEPTION 'FALHA: company_id de pet foi alterado (não deveria)';
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    RAISE NOTICE 'OK: trigger bloqueou alteração de company_id em pets';
END $$;

-- ---------------------------------------------------------------------------
-- 5) FK composta pets(customer_id, company_id) → customers(id, company_id)
--    Tentar vincular pet da Empresa B a tutor da Empresa A
--    (requer :PET_B_ID e :CUSTOMER_A_ID existentes)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  UPDATE public.pets
  SET customer_id = ':CUSTOMER_A_ID'
  WHERE id = ':PET_B_ID'
    AND company_id = ':COMPANY_B_ID';
  RAISE EXCEPTION 'FALHA: FK composta permitiu cross-tenant pet→customer';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK: FK composta bloqueou pet B → customer A';
END $$;

-- Tentativa de INSERT cross-tenant (User B)
SELECT set_config('request.jwt.claim.sub', ':USER_B_ID', true);

DO $$
BEGIN
  INSERT INTO public.pets (
    company_id, customer_id, name, species, sex, created_by
  ) VALUES (
    ':COMPANY_B_ID',
    ':CUSTOMER_A_ID',
    'Pet inválido',
    'dog',
    'unknown',
    ':USER_B_ID'
  );
  RAISE EXCEPTION 'FALHA: INSERT cross-tenant permitido';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK: INSERT cross-tenant bloqueado pela FK composta';
  WHEN OTHERS THEN
    RAISE NOTICE 'INSERT cross-tenant bloqueado (código: %)', SQLSTATE;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Soft delete — User B não vê registros arquivados da Empresa A
--    (primeiro arquiva como User A, depois verifica como User B)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', ':USER_A_ID', true);

UPDATE public.customers
SET deleted_at = now()
WHERE id = ':CUSTOMER_A_ID'
  AND company_id = ':COMPANY_A_ID'
  AND deleted_at IS NULL;
-- Esperado: 1 row (será revertido no ROLLBACK)

SELECT set_config('request.jwt.claim.sub', ':USER_B_ID', true);

SELECT count(*) AS user_b_ve_tutor_a_arquivado
FROM public.customers
WHERE id = ':CUSTOMER_A_ID'
  AND deleted_at IS NOT NULL;
-- Esperado: 0 (RLS impede ver linha de outra empresa)

-- ---------------------------------------------------------------------------
-- 7) Contagens cross-tenant (COUNT também é vazamento)
-- ---------------------------------------------------------------------------
SELECT count(*) AS total_customers_globais_user_b
FROM public.customers;
-- Esperado: apenas tutores da Empresa B (não incluir Empresa A)

SELECT count(*) AS total_pets_globais_user_b
FROM public.pets;
-- Esperado: apenas pets da Empresa B

-- ---------------------------------------------------------------------------
-- Fim — desfaz TODAS as alterações de teste
-- ---------------------------------------------------------------------------
ROLLBACK;

-- Após ROLLBACK, confirme no editor que nenhuma linha permaneceu alterada.
