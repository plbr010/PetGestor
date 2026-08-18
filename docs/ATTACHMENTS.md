# Anexos e fotos — pets e atendimentos

Armazenamento privado no Supabase Storage (`company-files`) com metadados em `pet_attachments` e `service_order_attachments`.

## Segurança

- Bucket **privado** — acesso via signed URL temporária (1h)
- Paths `{company_id}/pets/...` e `{company_id}/service-orders/...`
- RLS nas tabelas + políticas em `storage.objects` por pasta da empresa

## Limites

- Imagens: 8 MB (JPEG, PNG, WebP)
- PDF: 10 MB
- Thumbnails gerados no cliente antes do upload

## Migration

`supabase/migrations/20260818160000_pet_service_attachments.sql`

Requer `pets_id_company_id_key UNIQUE (id, company_id)` — criada na própria migration antes das FKs de anexos.
