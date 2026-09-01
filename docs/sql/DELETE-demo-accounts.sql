-- PetGestor — remover contas demo manualmente (Supabase SQL Editor)
--
-- Pré-requisito: aplicar docs/sql/APPLY-company-purge.sql (migration 20260901220000)
-- para contornar stock_movements imutáveis.
--
-- Critérios (espelham src/config/demo-accounts.ts):
--   - Nome da empresa = "Pet Shop Amigo Fiel"
--   - E-mail do owner com padrões de demo (+demo@, @demo., cursoragent@, etc.)
--
-- ATENÇÃO: irreversível. Revise o SELECT antes do DELETE.

-- 1) Pré-visualizar contas elegíveis
SELECT
  c.id AS company_id,
  c.name AS company_name,
  c.created_at,
  p.full_name AS owner_name,
  u.email AS owner_email
FROM public.companies c
JOIN public.company_members cm
  ON cm.company_id = c.id
 AND cm.role = 'owner'
JOIN public.profiles p
  ON p.id = cm.user_id
JOIN auth.users u
  ON u.id = cm.user_id
WHERE lower(trim(c.name)) = lower('Pet Shop Amigo Fiel')
   OR u.email ILIKE '%+demo@%'
   OR u.email ILIKE '%@demo.%'
   OR u.email ILIKE '%cursoragent@%'
   OR u.email ILIKE '%users.noreply.github.com%'
   OR u.email ILIKE 'demo.%'
ORDER BY c.created_at DESC;

-- 2) Apagar empresas demo (usa purge com bypass de stock_movements)
-- SELECT public.purge_company_for_platform_admin(id)
-- FROM (
--   SELECT c.id
--   FROM public.companies c
--   JOIN public.company_members cm ON cm.company_id = c.id AND cm.role = 'owner'
--   JOIN auth.users u ON u.id = cm.user_id
--   WHERE lower(trim(c.name)) = lower('Pet Shop Amigo Fiel')
--      OR u.email ILIKE '%+demo@%'
--      OR u.email ILIKE '%@demo.%'
--      OR u.email ILIKE '%cursoragent@%'
--      OR u.email ILIKE '%users.noreply.github.com%'
--      OR u.email ILIKE 'demo.%'
-- ) AS demo_companies;

-- 3) Apagar usuários órfãos (sem membership restante)
-- DELETE FROM auth.users u
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.company_members cm WHERE cm.user_id = u.id
-- )
-- AND (
--   u.email ILIKE '%+demo@%'
--   OR u.email ILIKE '%@demo.%'
--   OR u.email ILIKE '%cursoragent@%'
--   OR u.email ILIKE '%users.noreply.github.com%'
--   OR u.email ILIKE 'demo.%'
-- );

-- Arquivos no bucket `company-files/{company_id}/...` devem ser removidos
-- via Storage API / painel admin (a limpeza via app já faz isso).
