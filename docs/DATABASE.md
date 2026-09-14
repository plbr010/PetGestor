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
| `complete_onboarding(full_name, company_name, phone)` | public | Onboarding atômico + lock + membership revogada |
| `consume_auth_rate_limit(p_action, p_bucket_key)` | public | Rate limit atômico; **só service_role** |
| `auth_rate_limit_policy(p_action)` | private | Allowlist + limit/window; não executável por anon |
| `issue_password_recovery_marker` / `peek` / `consume` | public | Marker one-time; **só service_role** |
| `password_recovery_markers` | private | Hash do token + user_id + expiry + consumed_at |
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

Intervalo de almoço opcional (`break_start` / `break_end`): migration `20260911153000_agenda_civil_date_working_hours_recurrence.sql`.

## Etapa 7 — Agenda (Appointments)

Migration: `supabase/migrations/20260806073000_appointments.sql`

### Timezone da empresa

| Coluna | Tipo | Notas |
|--------|------|-------|
| `companies.timezone` | text NOT NULL | default `America/Sao_Paulo` |

Horários persistidos como **TIMESTAMPTZ**; interface usa horário local da empresa via `src/lib/timezone.ts`.
Data civil (`YYYY-MM-DD`) nunca é interpretada como instante UTC.

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
- RPC `create_appointment` / `update_appointment` validam jornada (incluindo intervalo), conflitos e snapshots
- RPC `create_appointment_recurrence`: série atômica com `idempotency_key` única por empresa
- RPC `transition_appointment_status`: `UPDATE … WHERE status` esperado (sem corrida SELECT+UPDATE)

Ver `docs/APPOINTMENTS.md`. **Migration pendente de aplicação remota:** `20260911153000_agenda_civil_date_working_hours_recurrence.sql` (BLOCO 2; aplica-se depois do BLOCO 1, sem reaplicá-lo).

## Etapa 10B — Mercado Pago billing

Migration: `supabase/migrations/20260806084500_mercado_pago_billing.sql`

Campos adicionais em `company_subscriptions` + tabela `billing_webhook_events` (idempotência).

BLOCO 9: `supabase/migrations/20260914150000_bloco9_billing_payments_webhook.sql`

- `company_subscriptions.provider_updated_at`, `checkout_idempotency_key`
- `billing_payments` UNIQUE `(provider, provider_payment_id)`, RLS sem policy para `authenticated`

Diagnóstico: `docs/sql/diagnose-bloco-9-billing.sql`. **Aplicada no remoto via SQL Editor (2026-09-14).** Próximas: `docs/SUPABASE_MIGRATIONS.md`.

## Etapa 10A — Trial e assinaturas

Migration: `supabase/migrations/20260806083000_subscriptions_trial.sql`

Ver `docs/SUBSCRIPTIONS.md`. **Migration pendente de aplicação remota.**

## Entidades NÃO criadas nesta etapa

Mercado Pago, checkout, webhooks, cobrança real, comissão, NF.

## Etapa 9 — Financeiro

Migration: `supabase/migrations/20260806081500_finance.sql`

BLOCO 5: `supabase/migrations/20260911220000_financial_payments_source_of_truth.sql`

Hardening BLOCO 5 (criação manual atômica): `supabase/migrations/20260911230000_create_manual_financial_entry_atomic.sql`

- `financial_entries.idempotency_key` — UNIQUE `(company_id, idempotency_key)` enquanto `deleted_at IS NULL`
- RPC `create_manual_financial_entry`: uma transação para pending (só entry) ou paid (entry + `financial_payment` + status derivado)

### Fonte de verdade

- `financial_entries.amount_cents` = faturado
- `financial_payments` (ativos) = recebido
- `financial_entries.payment_method` = compatibilidade (último método quando `paid`)

Ver `docs/FINANCE.md`. **Migration pendente de aplicação remota.**

## BLOCO 4 — Pacotes vendidos (pagamento, saldo, consumo)

Migration incremental: `supabase/migrations/20260911200000_customer_service_packages_payment_idempotency.sql`

Não reaplica BLOCO 1, 2 ou 3. Não altera relatórios.

### Separação de status

| Camada | Campo | Valores |
|--------|-------|---------|
| Operacional | `customer_service_packages.status` | `active`, `expired`, `fully_used`, `cancelled` |
| Financeiro | `financial_entries.status` (`source_type = service_package`) | `pending`, `paid`, `cancelled` |

Consumível somente se: `financial_status = paid` AND `package_status = active` AND saldo > 0 AND `expires_at >= hoje civil da empresa` AND pet/serviço/tenant compatíveis.

Pacote **pending não é crédito**.

### Venda

- Preço = `service_packages.price_cents` no servidor (snapshot em `price_cents_snapshot` e `financial_entries.amount_cents`)
- Preço vendido deve ser `> 0` e `<= 99999999`
- `idempotency_key` UNIQUE `(company_id, idempotency_key)` — retry devolve o pacote original
- Vínculo canônico: `customer_service_packages.financial_entry_id` ↔ `financial_entries.customer_service_package_id`

### Validade

`expires_at` é o último dia civil **inclusivo** no fuso `companies.timezone`. Expirado quando `expires_at < private.company_civil_today(company_id)`.

### Cancelamento

- Pending sem consumo: pacote + receita pending → `cancelled` (idempotente)
- Paid (com ou sem uso): bloqueado até existir política de estorno/reembolso

Diagnóstico de legado (somente leitura): `docs/sql/diagnose-bloco-4-packages.sql`

## Etapa — Estoque

Migration: `supabase/migrations/20260818120000_inventory.sql`

Tabelas: `product_categories`, `inventory_suppliers`, `products`, `product_batches`, `stock_movements`, `service_product_recipes` (stub).

RLS por `company_id` + `private.is_company_member`. Movimentações imutáveis. Saldo e custo médio só via RPC `register_stock_movement`.

Ver `docs/INVENTORY.md`. **Migration pendente de aplicação remota.**

## Etapa — PDV (BLOCO 6)

Migrations: `20260818140000_point_of_sale.sql`, `20260825160000_pdv_finalize.sql`, `20260911300000_pdv_server_side_price_checkout.sql`, `20260911320000_stock_expiration_company_civil_today.sql`, `20260911340000_pdv_due_date_company_civil_today.sql`

- Preço/total: `products.sale_price_cents` no servidor; snapshot em `sale_items`
- `sales.cash_received_cents` = tendered; `change_cents` = troco (não é receita)
- `sales.checkout_fingerprint` compara payload material na idempotência
- Estoque: `UPDATE … WHERE current_stock = previous AND new >= 0`
- Cancelamento de venda paga: `sale_paid_requires_refund`
- `financial_entries.due_date` da venda PDV: dia civil da empresa (`private.company_civil_today`)

Ver `docs/PDV.md`. Diagnóstico: `docs/sql/diagnose-bloco-6-pdv.sql`

## Entidades NÃO criadas na Etapa 9

PDV, comissão, NF, assinatura SaaS (trial implementado na 10A).

## Etapa 8 — Ordens de Serviço (Atendimentos)

Migration original: `supabase/migrations/20260806080000_service_orders.sql`

BLOCO 3 (máquina de estados / concorrência): `supabase/migrations/20260911180000_service_order_state_machine_concurrency.sql`

### Modelo

```text
appointments → service_orders (1:1)
```

- `service_orders` = fluxo operacional
- `appointments` = agendamento + snapshots comerciais (sem duplicação)
- `cancelled_at timestamptz` — instante UTC do cancelamento (não sobrescrito em retry)
- Transições atômicas `UPDATE … WHERE status = expected` + check-in `ON CONFLICT (appointment_id)`

Ver `docs/SERVICE_ORDERS.md`. **Migration BLOCO 3 pendente de aplicação remota.**

## Onboarding de ativação

Migration: `supabase/migrations/20260825200000_onboarding_progress.sql`

### Tabela `onboarding_progress`

Progresso por `(company_id, user_id)` — isolamento multi-tenant via RLS (`user_id = auth.uid()` + `is_company_member`).

| Coluna | Notas |
|--------|-------|
| `welcome_seen_at` | Modal de boas-vindas dispensado |
| `guided_active` / `guided_skipped_at` | Tutorial guiado ativo ou pulado |
| `last_guided_step` | Retomar guia |
| `workflow_step_viewed_at` / `finance_step_viewed_at` | Etapas educativas |
| `onboarding_completed_at` / `checklist_dismissed_at` | Conclusão |

Etapas de dados (serviço, funcionário, tutor+pet, agendamento) são **detectadas automaticamente** pelos counts da empresa — não dependem só de flags.

RPC: `upsert_onboarding_progress(p_company_id, p_patch)` (SECURITY DEFINER, `auth.uid()`).

Compat: `profiles.onboarding_tutorial_completed_at` continua sincronizado ao concluir.

## Aplicação da migration (Etapa 4)

Ver `docs/CUSTOMERS_PETS.md`.
