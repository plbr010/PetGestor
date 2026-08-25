# PetGestor — Banco de dados

## Etapa 3 — Multi-tenant e autenticação

Migration: `supabase/migrations/20260805201500_auth_multi_tenant.sql`

### Modelo

```text
auth.users
    ↓ 1:1
profiles
    ↓ N:M via company_members
companies
```

### Tabela `profiles`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | UUID PK | FK → `auth.users(id)` ON DELETE CASCADE |
| `full_name` | text | 2–120 caracteres |
| `avatar_url` | text nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Senha e e-mail **não** são duplicados — ficam no Supabase Auth.

### Tabela `companies`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `name` | text | 2–120 caracteres |
| `created_by` | UUID FK | → `auth.users(id)` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Criação via `complete_onboarding` — não via INSERT direto do cliente.

### Tabela `company_members`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `company_id` | UUID FK | PK composta |
| `user_id` | UUID FK | PK composta |
| `role` | text | CHECK: `owner`, `admin`, `staff` |
| `created_at` | timestamptz | |

### Funções

| Função | Schema | Uso |
|--------|--------|-----|
| `complete_onboarding(full_name, company_name)` | public | Onboarding atômico |
| `is_company_member(company_id)` | private | Helper RLS |
| `has_company_role(company_id, roles[])` | private | Helper RLS |
| `set_updated_at()` | public | Trigger |

### Row Level Security

- **profiles:** SELECT/UPDATE próprio usuário
- **companies:** SELECT membros; UPDATE owner/admin
- **company_members:** SELECT membros; sem mutações diretas nesta etapa

### Tipos TypeScript

`src/types/database.types.ts` — modelados manualmente; futuramente gerados via:

```bash
npx supabase gen types typescript --project-id <id> > src/types/database.types.ts
```

## Princípios para entidades futuras

- **UUIDs** como PKs
- **`company_id`** em tabelas de negócio (não `empresa_id` no perfil)
- **`created_at` / `updated_at`**
- **RLS obrigatório** em tabelas expostas
- **Soft delete** (`deleted_at`) quando apropriado

## Etapa 4 — Tutores e Pets

Migration: `supabase/migrations/20260805204500_customers_pets.sql`

### Modelo

```text
companies → customers → pets
```

Interface: **Tutores** · Banco: **`customers`**

### Tabela `customers`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | UUID PK | |
| `company_id` | UUID FK | → companies |
| `name` | text | 2–120 chars |
| `phone` | text | 10–11 dígitos |
| `email` | text nullable | até 254 chars |
| `notes` | text nullable | até 2000 chars |
| `created_by` | UUID FK | → auth.users |
| `created_at`, `updated_at` | timestamptz | |
| `deleted_at` | timestamptz nullable | soft delete |

UNIQUE `(id, company_id)` para FK composta com pets.

### Tabela `pets`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | UUID PK | |
| `company_id` | UUID FK | |
| `customer_id` | UUID FK | FK composta → customers(id, company_id) |
| `name`, `species`, `breed`, `sex` | text | species: dog/cat/other; sex: male/female/unknown |
| `birth_date` | date nullable | |
| `weight_kg` | numeric(6,2) nullable | |
| `color`, `allergies`, `notes` | text nullable | |
| `created_by` | UUID FK | |
| `deleted_at` | timestamptz nullable | |

### Integridade

- FK composta `(customer_id, company_id)` impede cross-company
- Trigger `private.prevent_company_change()` em customers e pets

### RLS

- SELECT/INSERT/UPDATE para membros da empresa
- Sem DELETE físico via browser

## Etapa 5 — Serviços

Migration: `supabase/migrations/20260805210000_services.sql`

### Modelo

```text
companies → services → service_size_prices (quando by_size)
```

### Tabela `services`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `pricing_mode` | text | `fixed` ou `by_size` |
| `price_cents` | integer nullable | centavos; obrigatório em `fixed` |
| `duration_minutes` | integer | 5–720; fallback mínimo em `by_size` |
| `active` | boolean | disponível para novos agendamentos |
| `deleted_at` | timestamptz nullable | soft delete |

UNIQUE `(id, company_id)` para FK composta com faixas.

### Tabela `service_size_prices`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `service_id`, `company_id` | UUID FK composta | → services |
| `size` | text | small, medium, large, giant |
| `price_cents` | integer | centavos |
| `duration_minutes` | integer | 5–720 |

UNIQUE `(service_id, size)`.

### RPC transacionais

| Função | Uso |
|--------|-----|
| `create_service_with_prices(...)` | Criação atômica service + faixas |
| `update_service_with_prices(...)` | Atualização atômica incluindo troca de pricing_mode |

### RLS

- SELECT/INSERT/UPDATE membros em `services`
- SELECT/INSERT/UPDATE/DELETE membros em `service_size_prices` (DELETE controlado via RPC/update)
- Trigger `prevent_company_change` em ambas

Ver `docs/SERVICES.md`. **Migration pendente de aplicação remota.**

## Etapa 6 — Funcionários

Migration: `supabase/migrations/20260806071500_employees.sql`

### Modelo

```text
companies → employees → employee_services → services
                     → employee_working_hours
```

Ver `docs/EMPLOYEES.md`. **Migration pendente de aplicação remota.**

## Etapa 7 — Agenda (Appointments)

Migration: `supabase/migrations/20260806073000_appointments.sql`

### Timezone da empresa

| Coluna | Tipo | Notas |
|--------|------|-------|
| `companies.timezone` | text NOT NULL | default `America/Sao_Paulo` |

Horários persistidos como **TIMESTAMPTZ**; interface usa horário local da empresa via `src/lib/timezone.ts`.

### Tabela `appointments`

Campos principais: `scheduled_start`, `scheduled_end`, `status`, snapshots (`service_name_snapshot`, `price_cents_snapshot`, `duration_minutes_snapshot`), `pet_size`, `notes`, `cancellation_reason`, soft delete.

Status: `scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`.

### Notificações internas (sino)

Tabela `app_notifications` — alertas in-app por empresa (e opcionalmente por usuário).

| Coluna | Notas |
|--------|-------|
| `company_id` | Tenant obrigatório |
| `user_id` | NULL = broadcast; preenchido = só aquele usuário |
| `type` / `severity` | Tipo de evento + info/success/warning/error |
| `dedupe_key` | Único por empresa — evita spam do mesmo alerta |
| `required_permission` | Filtro de permissão no app |
| `is_read` / `read_at` | Estado de leitura |

RLS: membro da empresa; SELECT/UPDATE só de broadcast ou do próprio `user_id`.

**Migration:** `supabase/migrations/20260825140000_app_notifications.sql`  
Atalho: `docs/sql/APPLY-app-notifications.sql`

Separado da fila WhatsApp (`notification_queue`).

### Notificações (fila + WhatsApp Cloud API)

`notification_queue` + `company_notification_settings` — lembretes de tutor e funcionário.

Telefone da equipe reutiliza `employees.phone` (nullable). Dia comercial e 08:00 usam `companies.timezone`.

Envio real: WhatsApp Cloud API oficial (Meta), via worker server-side. Novos campos de entrega (migration `20260817200000_whatsapp_notification_delivery.sql`):

| Coluna | Uso |
|--------|-----|
| `provider` | Sempre `whatsapp` nesta etapa |
| `provider_message_id` | ID da mensagem aceita pela Meta |
| `accepted_at` / `delivered_at` / `read_at` / `failed_at` | Rastreio de entrega |
| `provider_error_code` / `provider_error_message` | Erro sanitizado |
| `next_attempt_at` / `max_attempts` / `claimed_at` | Retry e lock |

Status extra: `simulated` (modo `WHATSAPP_SEND_ENABLED=false`, sem marcar entregue).

RPC `claim_due_notifications` (`FOR UPDATE SKIP LOCKED`) — **somente `service_role`**.

Índices: `(status, scheduled_for, next_attempt_at)` para a fila; único em `provider_message_id` quando preenchido.

**Migration pendente:** `supabase/migrations/20260817200000_whatsapp_notification_delivery.sql`

Ver `docs/WHATSAPP_SETUP.md`.

### Integridade

- FK composta pet → `(pet_id, customer_id, company_id)`
- FK composta serviço → `(service_id, company_id)`
- FK composta funcionário → `(employee_id, company_id)`
- FK composta employee_services → `(employee_id, service_id, company_id)`
- UNIQUE em `pets(id, customer_id, company_id)` e `employee_services(employee_id, service_id, company_id)`

### Conflitos (EXCLUDE + RPC)

- Extensão `btree_gist`
- EXCLUDE half-open `[)` para employee e pet (status ativos, `deleted_at IS NULL`)
- RPC `create_appointment` / `update_appointment` validam jornada, conflitos e snapshots

Ver `docs/APPOINTMENTS.md`. **Migration pendente de aplicação remota.**

## Etapa 10B — Mercado Pago billing

Migration: `supabase/migrations/20260806084500_mercado_pago_billing.sql`

Campos adicionais em `company_subscriptions` + tabela `billing_webhook_events` (idempotência).

Ver `docs/MERCADO_PAGO_SETUP.md`. **Migration pendente de aplicação remota.**

## Etapa 10A — Trial e assinaturas

Migration: `supabase/migrations/20260806083000_subscriptions_trial.sql`

Ver `docs/SUBSCRIPTIONS.md`. **Migration pendente de aplicação remota.**

## Entidades NÃO criadas nesta etapa

Mercado Pago, checkout, webhooks, cobrança real, comissão, NF.

## Etapa 9 — Financeiro

Migration: `supabase/migrations/20260806081500_finance.sql`

### Modelo

```text
service_orders → financial_entries (receita automática ao marcar pronto)
financial_entries (manual: receitas e despesas)
```

Ver `docs/FINANCE.md`. **Migration pendente de aplicação remota.**

## Etapa — Estoque

Migration: `supabase/migrations/20260818120000_inventory.sql`

Tabelas: `product_categories`, `inventory_suppliers`, `products`, `product_batches`, `stock_movements`, `service_product_recipes` (stub).

RLS por `company_id` + `private.is_company_member`. Movimentações imutáveis. Saldo e custo médio só via RPC `register_stock_movement`.

Ver `docs/INVENTORY.md`. **Migration pendente de aplicação remota.**

## Entidades NÃO criadas na Etapa 9

PDV, comissão, NF, assinatura SaaS (trial implementado na 10A).

## Etapa 8 — Ordens de Serviço (Atendimentos)

Migration: `supabase/migrations/20260806080000_service_orders.sql`

### Modelo

```text
appointments → service_orders (1:1)
```

- `service_orders` = fluxo operacional
- `appointments` = agendamento + snapshots comerciais (sem duplicação)

Ver `docs/SERVICE_ORDERS.md`. **Migration pendente de aplicação remota.**

## Aplicação da migration (Etapa 4)

Ver `docs/CUSTOMERS_PETS.md`.
