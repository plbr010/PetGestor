# PetGestor — Segurança

## Princípios

1. **Nenhum segredo no frontend** — service role e secret keys apenas no servidor quando estritamente necessário (não utilizadas nesta etapa).
2. **Isolamento entre empresas** — obrigatório via RLS no PostgreSQL + defense-in-depth na aplicação.
3. **Menor privilégio** — papéis `owner`, `admin`, `staff`.
4. **Validação de entradas** — Zod em Server Actions; UUID validado antes de queries.
5. **Proteção de rotas** — layouts server-side com `getClaims()`.
6. **Logs sem dados sensíveis** — nunca registrar senhas, tokens ou PII desnecessária.
7. **IDOR → 404 genérico** — nunca revelar que um UUID existe em outro tenant.

## Variáveis permitidas no frontend

| Variável | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública do projeto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publicável (browser-safe) |
| `NEXT_PUBLIC_APP_URL` | URL base da app (opcional, redirects) |
| `NEXT_PUBLIC_META_PIXEL_ID` | ID numérico do Meta Pixel (opcional) |
| `NEXT_PUBLIC_META_PIXEL_DEBUG` | Libera o Pixel em development (`true`) |

## Variáveis NÃO utilizadas

- `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- Senha do banco de dados
- JWT secret

Essas chaves **nunca** devem ser commitadas ou prefixadas com `NEXT_PUBLIC_`.

## Autenticação server-side

- **Proxy** (`src/proxy.ts`): refresh de sessão via `getClaims()`.
- **Layouts dashboard**: `requireUser()` + `requireCompany()` com consultas RLS.
- **Nunca** usar `getSession()` como fonte confiável de autorização server-side.
- **Nunca** usar `user_metadata` para decidir permissões.

## Row Level Security

Tabelas com RLS habilitado:

- `profiles`, `companies`, `company_members`
- `customers`, `pets`
- `services`, `service_size_prices`
- `employees`, `employee_services`, `employee_working_hours`
- `appointments`, `service_orders`, `financial_entries`, `company_subscriptions`
- `company_notification_settings`, `notification_queue`
- `product_categories`, `inventory_suppliers`, `products`, `product_batches`, `stock_movements`, `service_product_recipes`

Helpers em schema `private` (não exposto pela Data API):

- `private.is_company_member(company_id)` — membership **ativa** (`user_id = auth.uid()` AND `access_revoked_at IS NULL`)
- `private.has_company_role(company_id, roles[])` — idem, com role
- `private.member_has_active_access(company_id)` / `private.has_app_permission(company_id, permission)`
- `private.get_auth_company_id()` — lê o GUC `petgestor.company_id` (nunca infere tenant por `ORDER BY created_at`)
- `private.activate_company_context(company_id)` — valida membership ativa e define o GUC da transação
- `private.prevent_company_change()` — trigger; `search_path = public, private`

Token/sessão antiga de funcionário **revogado** perde SELECT/INSERT/UPDATE/RPC/Storage: a membership deixa de ser considerada ativa no PostgreSQL.

Tenant ativo nas mutações: `company_id` do contexto Next.js (`membership.company.id`) enviado como `p_company_id` nas RPCs. IDs de outra empresa falham com objeto indisponível, sem vazar existência.

Guard de rota: o proxy copia `x-pathname` para os headers da **request** (`NextResponse.next({ request: { headers } })`) para `assertCurrentRoutePermission` no layout do dashboard. Pathname ausente falha fechado (`dashboard.view`).

Função controlada de onboarding:

- `public.complete_onboarding(full_name, company_name)` — EXECUTE apenas para `authenticated`

### Dados de negócio (Etapa 4)

- `company_id` e `created_by` **nunca** vêm do browser como autorização
- Soft delete via `deleted_at` — sem DELETE físico
- FK composta `pets(customer_id, company_id) → customers(id, company_id)`
- `company_id` imutável via trigger

### Auditoria

- Plano manual: `docs/RLS_TEST_PLAN.md`
- Script SQL (ROLLBACK): `docs/RLS_AUDIT.sql`
- Relatório: `docs/TENANT_ISOLATION_AUDIT.md`

## Defense-in-depth (aplicação)

| Camada | Implementação |
|--------|---------------|
| Queries | `.eq("company_id", …)` em todas as operações por ID/listagem |
| Server Actions | `.eq("company_id", …)` + `didMutateAccessibleRow()` |
| Rotas `[id]` | `requireCustomerById` / `requirePetById` → `notFound()` |
| UUID | `isValidUuid()` — IDs inválidos tratados como inexistentes |

Arquivos: `src/lib/security/uuid.ts`, `src/lib/security/tenant-access.ts`

## Assinatura e trial (Etapa 10A)

- `company_subscriptions`: SELECT membros; **sem** INSERT/UPDATE/DELETE para `authenticated`
- Status `active` **não** pode ser definido pelo browser
- Entitlement calculado no servidor (`computeEntitlement`) — nunca `Date.now()` do client para autorização
- Status persistido `active` **não** libera acesso se `current_period_end` já passou ou está ausente
- Gate: layout dashboard + `requireCompanyContext()` em Server Actions
- `/assinatura` acessível sem entitlement operacional (erro recuperável se billing cair)
- `BILLING_DEV_BYPASS`: ignorado em produção mesmo se `true`
- `billing_payments` / `billing_webhook_events`: RLS on, **sem** policy para `authenticated` — só backend/webhook
- Access token e webhook secret Mercado Pago: server-only, nunca `NEXT_PUBLIC_`

### Service role (Etapa 10B — exceção controlada)

- `SUPABASE_SERVICE_ROLE_KEY` — **somente** `src/lib/supabase/admin.ts`
- Uso restrito: webhook Mercado Pago, sync billing, **cron/webhook WhatsApp** e **leituras do painel `/admin`** após `requirePlatformAdmin()`
- **Nunca** em Client Components, `NEXT_PUBLIC_`, ou CRUD operacional

### Platform admin (painel interno)

- Tabela `platform_admins` — INSERT apenas via SQL privilegiado / service_role
- RLS: SELECT da própria linha; sem INSERT/UPDATE/DELETE para `authenticated`
- Gate: `requirePlatformAdmin()` → `notFound()` se não for admin
- Menu "Admin" só renderiza quando `isPlatformAdmin` é verdadeiro (UI); a autorização real é no layout `/admin`

## WhatsApp Cloud API

- Tokens e secrets **somente** no servidor (`src/lib/whatsapp/`, nunca `NEXT_PUBLIC_`)
- Cron exige `Authorization: Bearer CRON_SECRET` (Vercel envia automaticamente se `CRON_SECRET` existir)
- Webhook POST exige HMAC SHA-256 (`x-hub-signature-256`) com `META_APP_SECRET`
- RPC `claim_due_notifications` concedida só a `service_role`
- Teste de envio: apenas `requirePlatformAdmin()` + número igual a `WHATSAPP_TEST_RECIPIENT`
- Isolamento: histórico e cancelamento filtram `company_id`; empresa A não vê fila da B

Ver `docs/WHATSAPP_SETUP.md`.

## Ferramentas de desenvolvimento

| Rota | Ambiente | Retorno |
|------|----------|---------|
| `/api/dev/security-context` | development | `{ authenticated, userId, companyId, companyName }` |
| `/api/dev/onboarding-status` | development | diagnóstico onboarding |

Production: `404`. Sem tokens, cookies ou PII.

## Open redirect

Parâmetros `next`, `redirect`, `returnTo` passam por `getSafeRedirectPath` — apenas caminhos internos (`/...`).

## CSRF e mutações

Operações mutáveis usam **Server Actions** ou Route Handlers POST/GET apropriados — sem endpoints GET mutáveis, **exceto** o cron autenticado da Vercel (`/api/cron/whatsapp-notifications` com `CRON_SECRET`).

## Rate limiting

Limites nativos do Supabase Auth **e** rate limit dedicado no Postgres (`private.auth_rate_limit_buckets` + `consume_auth_rate_limit(p_action, p_bucket_key)`). A primitive é **server-only** (`GRANT` só a `service_role`; o app usa o admin client). Chave hasheada (ação + sujeito + IP). Sem senha e sem e-mail em claro. Atomicidade via advisory lock + UPSERT. Limit/janela/relógio **não** vêm do cliente — `private.auth_rate_limit_policy` + `now()`. Em production, RPC ausente, service-role ausente ou resposta inválida falha fechado (não chama Auth). Development/test pode falhar aberto de propósito. Buckets com `updated_at` > 2h são removidos na própria RPC.

Recuperação de senha: ticket HMAC só com `AUTH_RECOVERY_SECRET` (≥ 32 bytes). Marker one-time: cookie opaco + hash em `private.password_recovery_markers`; consumo atômico. Sem `AUTH_RECOVERY_SECRET` o fluxo falha fechado. Sessão normal não basta para `/nova-senha`. E-mail inexistente ou rejeitado pelo GoTrue (`user_not_found` / e-mail inválido) usa a **mesma** mensagem genérica de sucesso; pane SMTP/5xx/redirect não allowlisted **não** é mascarada.

Confirmação de e-mail: regra de produto exige **Confirm email = ON** no painel Supabase (Authentication → Providers → Email). O app não descarta sessão no cliente para fingir o toggle.

## Variáveis de ambiente

- `.env.local` para configuração local (ignorado pelo Git via `.env*`)
- `.env.example` documenta variáveis sem valores reais

## Logs

- `console.info` / `console.error` em onboarding e membership: **somente development**
- Dashboard error boundary: apenas `error.message` (sem PII)
- Não logar phone, email, customer ou pet em produção

## Agenda (Etapa 7)

- `company_id` e `created_by` definidos server-side; nunca confiar em IDs do navegador para autorização
- `customer_id` derivado do pet na RPC — formulário não é fonte de verdade
- Preço/duração: snapshots calculados no servidor; frontend só preview
- Conflitos: RPC + EXCLUDE PostgreSQL (`btree_gist`, range `[)`)
- IDOR: `requireAppointmentById` → `notFound()` cross-tenant
- Cancelamento via status — sem DELETE físico

Ver `docs/APPOINTMENTS.md`.

## Atendimentos (Etapa 8)

- `service_orders` referencia `appointments` via FK composta — sem duplicar snapshots
- Operações que alteram appointment + ordem usam RPC transacional única
- UNIQUE `appointment_id` impede ordem duplicada
- Check-in idempotente retorna ordem existente
- IDOR: `requireServiceOrderById` → `notFound()` cross-tenant

Ver `docs/SERVICE_ORDERS.md`.

## Uploads (fotos)

Substituição de foto do pet:

1. validar tamanho + MIME + magic bytes;
2. path novo e único (`{companyId}/pets/{petId}/photo/{uuid}.{ext}`);
3. upload do arquivo novo;
4. persistir vínculo no banco;
5. só então remover o arquivo antigo.

Se o update no banco falhar, o arquivo **novo** é limpo (best-effort) e a foto antiga permanece. Falha ao apagar a antiga após persistir a nova não esconde o sucesso — fica órfão residual, sem perda da referência válida.

## Headers HTTP

Aplicados em `next.config.ts` via `src/lib/security/http-headers.ts`:

| Header | Valor | Quando |
|--------|--------|--------|
| `X-Content-Type-Options` | `nosniff` | sempre |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | sempre |
| `X-Frame-Options` | `DENY` | sempre |
| `Content-Security-Policy` | `frame-ancestors 'none'` | sempre (só clickjacking) |
| `Permissions-Policy` | camera/microfone/geolocation/payment/usb/topics vazios | sempre |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | só `VERCEL_ENV=production` |

CSP completa (`script-src`, `connect-src`, etc.) **não** está habilitada: Next.js, Meta Pixel, Supabase Auth, Mercado Pago e imagens exigiriam allowlist testada em produção. Uma política genérica quebraria o app.

Padrão Next: uma única regra `/:path*` (cobre `/`). Não há regra extra `"/"` para não duplicar headers na raiz. Callbacks `/auth/:path*` recebem `X-Robots-Tag: noindex, nofollow`.

`metadataBase` / sitemap / canonical **não** caem em `localhost` em production. Sem URL configurada o app falha fechado (`requireAppUrl` / `tryGetMetadataBaseUrl` indefinido).

Clickjacking: o app autenticado não pode ser embutido em iframe externo (`frame-ancestors 'none'` + `X-Frame-Options: DENY`).

## Próximas implementações

- SMTP próprio para e-mail transacional
- CSP completa (script/connect/img) após allowlist testada em produção
- Auditoria de ações sensíveis
