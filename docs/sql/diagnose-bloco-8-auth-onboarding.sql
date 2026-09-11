-- PetGestor BLOCO 8 — diagnóstico SOMENTE LEITURA (auth / onboarding / convites / fotos).
-- Não altera dados. Não apaga usuários, empresas, memberships ou arquivos.
-- Use no SQL Editor do Supabase para inspeção manual.

-- 1. Usuários com mais de uma empresa criada por onboarding (owner em 2+ companies)
SELECT
  cm.user_id,
  count(*) AS owner_memberships,
  array_agg(cm.company_id ORDER BY cm.created_at) AS company_ids
FROM public.company_members cm
WHERE cm.role = 'owner'
GROUP BY cm.user_id
HAVING count(*) > 1;

-- 2. Memberships duplicadas ativas por usuário (mesmo user em várias empresas ativas)
SELECT
  cm.user_id,
  count(*) FILTER (WHERE cm.access_revoked_at IS NULL) AS active_memberships,
  count(*) FILTER (WHERE cm.access_revoked_at IS NOT NULL) AS revoked_memberships
FROM public.company_members cm
GROUP BY cm.user_id
HAVING count(*) FILTER (WHERE cm.access_revoked_at IS NULL) > 1
    OR (
      count(*) FILTER (WHERE cm.access_revoked_at IS NULL) = 0
      AND count(*) FILTER (WHERE cm.access_revoked_at IS NOT NULL) > 0
    );

-- 3. Trials/assinaturas duplicadas (não deveria ocorrer: PK company_id)
SELECT
  cs.company_id,
  count(*) AS subscription_rows
FROM public.company_subscriptions cs
GROUP BY cs.company_id
HAVING count(*) > 1;

-- 4. Convites pendentes duplicados por e-mail na mesma empresa
SELECT
  company_id,
  lower(email) AS email_normalized,
  count(*) AS pending_count,
  array_agg(id) AS invite_ids
FROM public.company_member_invites
WHERE status = 'pending'
GROUP BY company_id, lower(email)
HAVING count(*) > 1;

-- 5. onboarding_progress duplicado por (company_id, user_id)
SELECT
  company_id,
  user_id,
  count(*) AS rows
FROM public.onboarding_progress
GROUP BY company_id, user_id
HAVING count(*) > 1;

-- 6. Foto de pet com path fora do padrão tenant/{company}/pets/{id}/
SELECT
  p.company_id,
  p.id AS pet_id,
  p.photo_storage_path,
  p.photo_thumb_path
FROM public.pets p
WHERE p.photo_storage_path IS NOT NULL
  AND p.photo_storage_path NOT LIKE p.company_id::text || '/pets/' || p.id::text || '/%';

-- 7. Thumbnail apontando para o arquivo principal (legado)
SELECT
  p.company_id,
  p.id AS pet_id,
  p.photo_storage_path,
  p.photo_thumb_path
FROM public.pets p
WHERE p.photo_storage_path IS NOT NULL
  AND p.photo_thumb_path IS NOT NULL
  AND p.photo_storage_path = p.photo_thumb_path;

-- 8. Path legado sem UUID de versão (main.jpg direto em /photo/)
SELECT
  p.company_id,
  p.id AS pet_id,
  p.photo_storage_path
FROM public.pets p
WHERE p.photo_storage_path ~ '/pets/.+/photo/main\.';
