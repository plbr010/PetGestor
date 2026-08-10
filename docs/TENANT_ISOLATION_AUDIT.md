# PetGestor — Auditoria de isolamento multi-tenant

**Data:** 2026-08-05  
**Escopo:** Etapas 1–4 (auth, multi-tenancy, tutores, pets)  
**Objetivo:** Provar que Empresa A não acessa dados da Empresa B (e vice-versa).

---

## 1. Ameaças consideradas

| Ameaça | Mitigação |
|--------|-----------|
| IDOR por UUID na URL | Queries + RLS filtram por `company_id`; páginas usam `notFound()` sem revelar existência |
| UPDATE/ARCHIVE por ID de outro tenant | Server Actions usam `.eq("company_id", …)` + verificação de zero rows |
| Vincular pet a tutor de outra empresa | FK composta `(customer_id, company_id)` no PostgreSQL |
| Mover registro entre empresas | Trigger `private.prevent_company_change()` |
| COUNT/search vazando totais cross-tenant | Queries sempre com `.eq("company_id", …)`; RLS no banco |
| Bypass via service_role | **Não utilizado** na aplicação |
| Soft delete visível cross-tenant | RLS por `company_id`; listagens filtram `deleted_at IS NULL` |

---

## 2. Row Level Security (PostgreSQL)

### Tabelas auditadas

- `public.profiles` — SELECT/UPDATE apenas próprio usuário
- `public.companies` — SELECT membros; UPDATE owner/admin
- `public.company_members` — SELECT membros da mesma empresa
- `public.customers` — SELECT/INSERT/UPDATE membros (`private.is_company_member`)
- `public.pets` — SELECT/INSERT/UPDATE membros (`private.is_company_member`)

### Helpers SECURITY DEFINER

| Função | search_path | Observação |
|--------|-------------|------------|
| `private.is_company_member` | `public, private, auth` | Usa `auth.uid()`; schemas qualificados |
| `private.has_company_role` | `public, private, auth` | Idem |
| `private.prevent_company_change` | `public, private` | Trigger BEFORE UPDATE |
| `public.complete_onboarding` | `public, private, auth` | EXECUTE apenas `authenticated` |

Migration de correção `20260805203000_fix_onboarding_rls.sql` garante `GRANT EXECUTE` em helpers para `authenticated`.

**RLS permanece habilitado.** Nenhuma policy foi removida ou desativada nesta auditoria.

---

## 3. Defense-in-depth (aplicação)

Além do RLS, a camada server-side aplica:

1. **`requireCompanyContext()`** — toda operação de negócio exige membership válido
2. **Filtro explícito `company_id`** em queries e mutações (não confia só no ID)
3. **`isValidUuid()`** — IDs malformados retornam null / `notFound()` / erro genérico
4. **`didMutateAccessibleRow()`** — zero rows tratado como inacessível (mensagem genérica, sem 403)
5. **`requireCustomerById` / `requirePetById`** — chamam `notFound()` quando recurso inacessível

Arquivos: `src/lib/security/uuid.ts`, `src/lib/security/tenant-access.ts`

---

## 4. IDOR (rotas dinâmicas)

| Rota | Comportamento cross-tenant |
|------|---------------------------|
| `/dashboard/tutores/[id]` | `404` via `notFound()` |
| `/dashboard/tutores/[id]/editar` | `404` via `notFound()` |
| `/dashboard/pets/[id]` | `404` via `notFound()` |
| `/dashboard/pets/[id]/editar` | `404` via `notFound()` |

**Nunca** exibe mensagens como “pertence a outra empresa”.

---

## 5. FK composta pet → customer

```sql
CONSTRAINT pets_customer_company_fkey
  FOREIGN KEY (customer_id, company_id)
  REFERENCES public.customers (id, company_id)
```

Impede `pet B.customer_id = customer A.id` mesmo contornando a interface.

---

## 6. Imutabilidade de `company_id`

Trigger `private.prevent_company_change()` em `customers` e `pets` — tentativa de UPDATE em `company_id` lança `SQLSTATE 22023`.

---

## 7. Busca e paginação

- `getCustomers` / `getPets`: `.eq("company_id", companyId)` + soft delete
- Parâmetros `?q=`, `?species=`, `?page=` respeitam tenant via contexto da sessão
- Contagens (`countActiveCustomers`, `countActivePets`) filtradas por empresa

---

## 8. Soft delete

Registros com `deleted_at IS NOT NULL` excluídos das listagens normais. Cross-tenant bloqueado pelo RLS antes de qualquer filtro de soft delete.

---

## 9. Ferramenta dev

`GET /api/dev/security-context` (somente `NODE_ENV=development`):

```json
{
  "authenticated": true,
  "userId": "...",
  "companyId": "...",
  "companyName": "..."
}
```

Production: `404`. Não expõe tokens, cookies ou PII.

---

## 10. Testes realizados (automáticos — aplicação)

| Área | Arquivo | O que prova |
|------|---------|-------------|
| UUID | `src/lib/security/uuid.test.ts` | Validação de IDs |
| Zero rows / 404 | `src/lib/security/tenant-access.test.ts` | Helpers de mutação |
| Paginação | `src/lib/pagination.test.ts` | Helpers de página |
| Schemas | `customers/schemas.test.ts`, `pets/schemas.test.ts` | Entrada válida |

**Mocks NÃO provam RLS PostgreSQL.** Testes unitários validam lógica da aplicação apenas.

---

## 11. Testes manuais pendentes (obrigatórios para aceite final)

### Criar Empresa B

1. Abra o app em janela anônima (ou outro navegador)
2. Acesse `/cadastro`
3. Use **outro e-mail** (ex.: `teste.b@seu-dominio.com`)
4. Preencha nome e nome da empresa (ex.: “Empresa B Teste”)
5. Confirme o e-mail e conclua onboarding
6. Opcional: `GET http://localhost:3000/api/dev/security-context` — anote `companyId`

### Na Empresa A (conta original)

1. Crie tutor **“Teste Empresa A”**
2. Crie pet **“Rex Empresa A”**
3. Abra detalhes e copie UUIDs das URLs:
   - `/dashboard/tutores/<UUID_TUTOR_A>`
   - `/dashboard/pets/<UUID_PET_A>`

### Teste cross-tenant (Empresa B)

Estando logado como Usuário B:

1. Acesse `/dashboard/tutores/<UUID_TUTOR_A>` → **deve mostrar 404**
2. Acesse `/dashboard/pets/<UUID_PET_A>` → **deve mostrar 404**

### SQL Editor

Execute `docs/RLS_AUDIT.sql` com placeholders substituídos. Leia avisos sobre limitação de simulação JWT.

---

## 12. O que realmente prova isolamento no PostgreSQL

| Prova | Método |
|-------|--------|
| RLS SELECT/UPDATE cross-tenant | `docs/RLS_AUDIT.sql` (se `auth.uid()` simular corretamente) + teste manual duas contas |
| FK composta | Bloco 5 de `RLS_AUDIT.sql` ou tentativa via SQL direto |
| company_id imutável | Bloco 4 de `RLS_AUDIT.sql` |
| End-to-end IDOR | Teste manual UUID cross-tenant no browser |

---

## 13. Problemas encontrados e correções

| Problema | Correção |
|----------|----------|
| Mutations não padronizavam zero rows | `didMutateAccessibleRow()` + mensagem genérica |
| IDs malformados podiam gerar queries desnecessárias | `isValidUuid()` em queries e actions |
| Falta de script SQL de auditoria | `docs/RLS_AUDIT.sql` |
| Falta de rota dev para contexto | `/api/dev/security-context` |

Nenhum bypass de RLS ou uso de service_role foi introduzido.

---

## 14. Confirmações

- [x] Nenhuma nova funcionalidade de negócio (agenda, financeiro, etc.)
- [x] RLS ativa nas migrations
- [x] `.env.local` ignorado pelo Git (`.env*` no `.gitignore`)
- [x] Sem credenciais reais no repositório
- [x] Logs de produção sem PII desnecessária (logs dev-only em onboarding/membership)
