# Anexos e fotos — pets e atendimentos

Armazenamento privado no Supabase Storage (`company-files`) com metadados em `pet_attachments` e `service_order_attachments`.

## Segurança

- Bucket **privado** — acesso via signed URL temporária (1h)
- Paths `{company_id}/pets/...` e `{company_id}/service-orders/...`
- RLS nas tabelas + políticas em `storage.objects` por pasta da empresa

## Limites

- Imagens e PDFs: 10 MB (alinhado ao CHECK do banco, bucket Storage e `bodySizeLimit` do Next.js)
- Tipos: JPEG, PNG, WebP e PDF
- Validação no servidor: tamanho, MIME declarado, magic bytes e estrutura mínima (SOF/IHDR/VP8)
- Thumbnails gerados no cliente; o servidor recusa thumbnail/conteúdo que não seja imagem processável

## Substituição de foto

1. Validar o arquivo novo
2. Gerar path único (`{company_id}/pets/{pet_id}/photo/{uuid}/…`) — o nome original do usuário nunca vai para o Storage
3. Upload do novo (sem upsert)
4. Persistir paths no banco
5. Só então remover o arquivo antigo

Se 2–4 falhar, a foto antiga permanece. Órfão novo é removido em best-effort, sem esconder o erro principal.

Paths legados (`…/photo/main.jpg`) continuam válidos na leitura. Diagnóstico: `docs/sql/diagnose-bloco-8-auth-onboarding.sql`.

## Migration

`supabase/migrations/20260818160000_pet_service_attachments.sql`

Requer `pets_id_company_id_key UNIQUE (id, company_id)` — criada na própria migration antes das FKs de anexos.
