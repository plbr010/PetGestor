-- PetGestor BLOCO 8 — diagnóstico SOMENTE LEITURA.
-- Auth, onboarding, convites, fotos e rate limit.
-- Não altera dados. Não faz autofix.

-- 1. Usuários com mais de uma empresa criada por eles (possível corrida de onboarding legado)
SELECT
  c.created_by AS user_id,
  count(*) AS companies_created,
  array_agg(c.id ORDER BY c.created_at) AS company_ids
FROM public.companies c
WHERE c.created_by IS NOT NULL
GROUP BY c.created_by
HAVING count(*) > 1;

-- 2. Memberships ativas duplicadas por usuário (mais de um tenant ativo)
SELECT
  cm.user_id,
  count(*) AS active_memberships,
  array_agg(cm.company_id ORDER BY cm.updated_at DESC NULLS LAST) AS company_ids
FROM public.company_members cm
WHERE cm.access_revoked_at IS NULL
GROUP BY cm.user_id
HAVING count(*) > 1;

-- 3. Usuário só com membership revogada
SELECT
  cm.user_id,
  count(*) AS revoked_memberships
FROM public.company_members cm
WHERE NOT EXISTS (
  SELECT 1
  FROM public.company_members active
  WHERE active.user_id = cm.user_id
    AND active.access_revoked_at IS NULL
)
GROUP BY cm.user_id;

-- 4. Empresas sem subscription/trial
SELECT
  c.id AS company_id,
  c.name,
  c.created_at
FROM public.companies c
LEFT JOIN public.company_subscriptions cs
  ON cs.company_id = c.id
WHERE cs.company_id IS NULL;

-- 5. Empresas com mais de um registro de subscription (não deveria: PK company_id)
SELECT
  cs.company_id,
  count(*) AS subscription_rows
FROM public.company_subscriptions cs
GROUP BY cs.company_id
HAVING count(*) > 1;

-- 6. Convites pendentes duplicados por empresa+funcionário
SELECT
  i.company_id,
  i.employee_id,
  count(*) AS pending_invites
FROM public.company_member_invites i
WHERE i.status = 'pending'
GROUP BY i.company_id, i.employee_id
HAVING count(*) > 1;

-- 7. onboarding_progress duplicado por empresa+usuário
SELECT
  op.company_id,
  op.user_id,
  count(*) AS progress_rows
FROM public.onboarding_progress op
GROUP BY op.company_id, op.user_id
HAVING count(*) > 1;

-- 8. Pets com path de foto fora do prefixo da empresa
SELECT
  p.company_id,
  p.id AS pet_id,
  p.photo_storage_path,
  p.photo_thumb_path
FROM public.pets p
WHERE p.photo_storage_path IS NOT NULL
  AND p.photo_storage_path NOT LIKE (p.company_id::text || '/%');

-- 9. Pets com foto apontando para path de outra empresa
SELECT
  p.company_id,
  p.id AS pet_id,
  p.photo_storage_path
FROM public.pets p
WHERE p.photo_storage_path IS NOT NULL
  AND split_part(p.photo_storage_path, '/', 1) <> p.company_id::text;

-- 10. Paths de foto no padrão legado (main./thumb.) — válidos, mas previsíveis
SELECT
  p.company_id,
  p.id AS pet_id,
  p.photo_storage_path
FROM public.pets p
WHERE p.photo_storage_path LIKE '%/photo/main.%'
   OR p.photo_thumb_path LIKE '%/photo/thumb.%';
