## [0.22.0] — 2026-08-17

### Adicionado — WhatsApp Cloud API (fila de lembretes)

- Provider isolado (`src/lib/whatsapp/`) usando Graph API oficial da Meta (mensagens tipo `template`)
- Worker com claim `FOR UPDATE SKIP LOCKED`, retries com backoff e janela de tolerância
- Cron Vercel `/api/cron/whatsapp-notifications` e webhook `/api/webhooks/whatsapp`
- Histórico: Pendente, Processando, Enviada, Entregue, Lida, Falhou, Cancelada
- Modo `WHATSAPP_SEND_ENABLED=false` (simulação, sem marcar entregue)
- Teste interno no painel `/admin` (número autorizado no servidor)

**MIGRATION PENDENTE:** `supabase/migrations/20260817200000_whatsapp_notification_delivery.sql`

Código pronto; integração aguardando configuração da conta Meta/templates/credenciais.

## [0.21.0] — 2026-08-17

### Adicionado — Lembretes internos para tutor e funcionário

- Reutiliza `notification_queue` e `company_notification_settings` (sem WhatsApp ainda)
- Lembrete do dia (horário configurável, padrão 08:00 no timezone da empresa)
- Lembretes 2h e do dia também para a equipe, usando `employees.phone`
- Destinatário `customer` / `employee` na fila e no histórico
- Falta (`no_show`) cancela lembretes futuros; `getDueNotifications()` preparado para o worker
- Templates internos atualizados; pet pronto continua idempotente por `service_order_id`

**MIGRATION PENDENTE:** `supabase/migrations/20260817193000_customer_employee_reminders.sql`

## [0.20.0] — 2026-08-17

### Adicionado — Agenda mais rápida + lista de espera

- Criação rápida na agenda (clique em slot ou botão) via sheet sem sair da página
- Painel rápido do agendamento: confirmar, cancelar, falta, check-in, duplicar, editar
- Lista de espera (`appointment_waitlist`) com conversão em agendamento
- Aviso interno ao cancelar quando há clientes compatíveis na lista de espera
- Bloqueios pontuais de horário (`schedule_time_blocks`) integrados a slots e RPCs

**MIGRATION PENDENTE:** `supabase/migrations/20260817180000_agenda_waitlist_time_blocks.sql`

## [0.19.0] — 2026-08-17

### Adicionado — Histórico completo do pet

- Timeline operacional na ficha do pet (agendamentos, atendimentos, financeiro, pacotes, cancelamentos/faltas)
- Cards de resumo: último atendimento, próximo agendamento, totais, gasto e serviço mais realizado
- Painel destacado "Informações importantes" (alergias + cuidados/comportamento)
- Coluna `pets.important_notes` para cuidados operacionais
- Paginação "Carregar mais" sem duplicar tabelas de histórico

**MIGRATION PENDENTE:** `supabase/migrations/20260817160000_pet_important_notes.sql`

## [0.18.0] — 2026-08-17

### Adicionado — Pacotes de serviços

- Catálogo de pacotes (`service_packages` + itens) em Serviços → Pacotes
- Venda de pacote na ficha do pet com receita financeira (`source_type: service_package`)
- Consumo explícito via "Usar pacote" no atendimento (não automático)
- Estorno controlado, saldo por serviço, validade e status (ativo/expirado/utilizado/cancelado)
- `mark_service_order_ready` não gera receita avulsa quando preço = 0 (coberto por pacote)

**MIGRATION PENDENTE:** `supabase/migrations/20260817140000_service_packages.sql`

## [0.17.0] — 2026-08-17

### Adicionado — Fila interna de confirmações e lembretes

- Tabelas `company_notification_settings` e `notification_queue` (sem envio externo ainda)
- Confirmação ao criar, lembretes 24h/2h, aviso pet pronto — respeitando timezone da empresa
- Toggles em Configurações · histórico simples de mensagens geradas
- Telefone do tutor reutiliza `customers.phone` (E.164 na fila)
- Idempotência via índices únicos parciais; cancelamento preserva histórico

**MIGRATION PENDENTE:** `supabase/migrations/20260817120000_appointment_notifications.sql`

## [0.16.1] — 2026-08-15

### Corrigido — Assinatura dentro do app autenticado

- `/assinatura` e `/assinatura/retorno` movidas para o layout do dashboard (sidebar/header)
- Gate operacional isolado em `/dashboard/*` (sem loop e sem “logout” visual)
- Sessão preservada ao abrir Assinatura; trial expirado continua podendo regularizar

## [0.16.0] — 2026-08-15

### Adicionado — Recorrência de agendamentos (etapa 1)

- Tabela `appointment_recurrences` + `appointments.recurrence_id` / `recurrence_index`
- Frequências: semanal, quinzenal, mensal, personalizado em dias
- Término por quantidade (máx. 52) ou data — sem recorrência infinita
- Conflitos: cada ocorrência passa por `create_appointment`; falhas são reportadas
- Edição/cancelamento: somente este · este e os próximos
- Badge “Recorrente” na agenda e no detalhe

**MIGRATION PENDENTE:** `supabase/migrations/20260815020000_appointment_recurrences.sql`

## [0.15.1] — 2026-08-14

### Corrigido — Loop de redirects no dashboard

- Select de `profiles` com fallback se `onboarding_tutorial_completed_at` ainda não existir no banco
- Evita loop Safari `/dashboard` ↔ `/onboarding` quando a migration do tutorial não foi aplicada

## [0.15.0] — 2026-08-14

### Adicionado — Tutorial inicial guiado

- Tour de 8 etapas no dashboard após onboarding da empresa
- Estado em `profiles.onboarding_tutorial_completed_at` (por usuário)
- Pular/concluir marca no servidor via RPC `complete_onboarding_tutorial` (`auth.uid()`)
- Contas existentes pré-marcadas na migration (não interrompe quem já usa)
- “Ver tutorial novamente” em Configurações (sem resetar o status)
- Mobile: card inferior legível (spotlight do menu no desktop)

**MIGRATION PENDENTE:** `supabase/migrations/20260814210000_onboarding_tutorial.sql`

## [0.14.0] — 2026-08-13

### Adicionado — Telefone no cadastro e área do assinante

- Campo obrigatório **Telefone / WhatsApp** no cadastro/onboarding (validação BR + E.164)
- Migration `profiles.phone` (NULL permitido para contas antigas) + `complete_onboarding(..., p_phone)`
- Telefone do responsável na listagem/detalhe do painel admin + link WhatsApp (`wa.me`)
- Área do assinante em `/assinatura`: plano, status, trial, cobranças, acesso, regularização e cancelamento
- Forma de pagamento: texto seguro (sem dados sensíveis do Mercado Pago)

### Não incluído

- Troca de plano, cupons, reembolso, NF, carteira interna

**MIGRATION PENDENTE:** `supabase/migrations/20260813200000_profile_phone.sql`

## [0.13.0] — 2026-08-13

### Adicionado — Painel administrativo interno

- Tabela `platform_admins` com RLS (SELECT próprio; sem INSERT/UPDATE/DELETE para clientes)
- Gate server-side `requirePlatformAdmin()` → 404 para não-admins
- Rotas `/admin` e `/admin/[companyId]` (somente visualização)
- Cards: total, trial, ativas, inadimplentes, canceladas, bloqueadas, MRR estimado
- Menu "Admin" apenas para platform admin
- Queries cross-tenant via `service_role` apenas após gate server-side

### Não incluído

- Edição/cancelamento/impersonação/cobrança manual pelo painel

**MIGRATION PENDENTE:** `supabase/migrations/20260813190000_platform_admins.sql`

## [0.12.0] — 2026-08-06


### Adicionado — Mercado Pago e assinatura real (Etapa 10B)

- Migration billing: campos provider, `billing_webhook_events`
- Integração Mercado Pago Subscriptions (preapproval pending, sem plano)
- Checkout hospedado via `init_point` — PetGestor não coleta cartão
- Webhook `POST /api/webhooks/mercado-pago` com validação `x-signature`
- Actions: checkout, refresh, cancelamento
- Rotas: `/assinatura`, `/assinatura/retorno`
- Admin Supabase (`service_role`) restrito a billing/webhook
- Documentação: `docs/MERCADO_PAGO_SETUP.md`, `docs/MERCADO_PAGO_TEST_PLAN.md`

### Regras preservadas

- Trial 72h local sem MP; checkout bloqueado antes de expirar
- Nenhuma cobrança automática ao fim do trial
- R$ 89,90/mês; sem `free_trial` no Mercado Pago

**MIGRATION PENDENTE:** `supabase/migrations/20260806084500_mercado_pago_billing.sql`

## [0.11.0] — 2026-08-06

### Adicionado — Trial 72h e controle de acesso (Etapa 10A)

- Migration `company_subscriptions` com trial exato de 72 horas
- Trigger automático ao criar empresa + backfill seguro
- Feature `src/features/subscription/` — entitlement, queries, banner, tela de assinatura
- Gate central: layout dashboard + `requireCompanyContext()`
- Rota `/assinatura` acessível com trial expirado
- Config: `TRIAL_DURATION_HOURS=72`, `PLAN_MONTHLY_PRICE_CENTS=8990`
- Documentação: `docs/SUBSCRIPTIONS.md`, `docs/TRIAL_TEST_PLAN.md`
- Testes: entitlement, utils, config

### Não incluído

- Mercado Pago, checkout, cartão, Pix, boleto, webhooks, cobrança automática

**MIGRATION PENDENTE:** `supabase/migrations/20260806083000_subscriptions_trial.sql`

## [0.10.0] — 2026-08-06

### Adicionado — Financeiro operacional (Etapa 9)

- Migration `financial_entries` com RLS, constraints, índices e RPCs financeiras
- Atualização transacional de `mark_service_order_ready` — gera receita pending com snapshot
- Feature `src/features/finance/` — actions, queries, schemas, componentes
- Páginas: `/dashboard/financeiro`, nova receita, nova despesa, detalhe
- Integração financeira em atendimentos e dashboard com métricas reais
- Documentação: `docs/FINANCE.md`, `docs/FINANCE_TEST_PLAN.md`
- Testes: status, schemas, utils (cálculos, moeda, filtros)

### Não incluído

- NF, boleto, Pix automático, conciliação, DRE contábil, comissão, estoque, assinatura SaaS, trial

**MIGRATION PENDENTE:** `supabase/migrations/20260806081500_finance.sql`

## [0.9.0] — 2026-08-06

### Adicionado — Atendimentos / Ordens de Serviço (Etapa 8)

- Migration `service_orders` com RLS, FK composta e RPCs transacionais
- Fluxo: check-in → aguardando → em atendimento → pronto → entregue
- Sincronização atômica com status de `appointments`
- Feature `src/features/service-orders/` — actions, queries, schemas, componentes
- Páginas: `/dashboard/atendimentos`, `/dashboard/atendimentos/[id]`
- Check-in na agenda (`Pet chegou`)
- Dashboard: métricas Aguardando, Em atendimento, Prontos para buscar
- Documentação: `docs/SERVICE_ORDERS.md`, `docs/SERVICE_ORDERS_TEST_PLAN.md`
- Testes: status, schemas, utils

### Não incluído

- Pagamento, financeiro, estoque, comissões, NF, WhatsApp, IA

**MIGRATION PENDENTE:** `supabase/migrations/20260806080000_service_orders.sql`

## [0.8.1] — 2026-08-06

### Alterado — Período de teste gratuito

- Teste gratuito padronizado para **3 dias** (antes 7 dias) em landing, marketing e documentação
- Constante futura `TRIAL_DURATION_DAYS = 3` em `src/config/subscription.ts`
- Requisitos documentados para implementação futura de assinatura (sem cobrança nesta etapa)

## [0.8.0] — 2026-08-06

### Adicionado — Agenda (Etapa 7)

- Migration `appointments` com timezone em `companies`, EXCLUDE de conflitos, RLS e RPCs
- RPC: `create_appointment`, `update_appointment` (snapshots, jornada, conflitos)
- Feature `src/features/appointments/` — actions, queries, schemas, status, componentes
- Páginas: `/dashboard/agenda` (dia/semana, filtros), novo, detalhe, editar
- Dashboard: métrica real "Agendamentos hoje", listas de hoje e próximos atendimentos
- Timezone: `src/lib/timezone.ts`
- Documentação: `docs/APPOINTMENTS.md`, `docs/APPOINTMENTS_TEST_PLAN.md`
- Testes: schemas, status, utils, timezone

### Não incluído

- Ordem de serviço, pagamento, financeiro, estoque, comissão, WhatsApp, atendimento completo

**MIGRATION PENDENTE:** `supabase/migrations/20260806073000_appointments.sql`

## [0.7.0] — 2026-08-06

### Adicionado — Funcionários (Etapa 6)

- Migration `employees`, `employee_services`, `employee_working_hours` com FK composta e RLS
- RPC transacionais: `create_employee_with_schedule`, `update_employee_with_schedule`
- Feature `src/features/employees/` — CRUD, serviços vinculados, horários semanais
- Páginas: `/dashboard/funcionarios` (lista, busca, filtros), novo, detalhe, editar
- Navegação: item "Funcionários" no dashboard
- Métrica "Funcionários ativos" no dashboard
- Documentação: `docs/EMPLOYEES.md`, `docs/EMPLOYEES_TEST_PLAN.md`
- Testes: schemas e utils de funcionários

### Não incluído

- Agenda, agendamentos, comissões, folha, ponto, login de funcionário, convites, financeiro

**MIGRATION PENDENTE:** `supabase/migrations/20260806071500_employees.sql`

## [0.6.0] — 2026-08-05

### Adicionado — Serviços (Etapa 5)

- Migration `services` + `service_size_prices` com FK composta e RLS
- RPC transacionais: `create_service_with_prices`, `update_service_with_prices`
- Preços em centavos (`src/lib/money.ts`) — fixed e by_size (4 portes)
- Feature `src/features/services/` — actions, queries, schemas, componentes
- Páginas: `/dashboard/servicos` (lista, busca, filtro, paginação), novo, detalhe, editar
- Ativar/desativar, arquivar (soft delete), métrica "Serviços ativos" no dashboard
- Documentação: `docs/SERVICES.md`, `docs/SERVICES_TEST_PLAN.md`
- Testes: moeda BRL, schemas, utils de serviços

### Não incluído

- Agenda, agendamento, funcionários, comissões, atendimento, financeiro, pagamentos

**MIGRATION PENDENTE:** `supabase/migrations/20260805210000_services.sql`

## [0.5.1] — 2026-08-05

### Auditoria de segurança (isolamento multi-tenant)

- Defense-in-depth: validação UUID, helpers `didMutateAccessibleRow` / `shouldTreatAsNotFound`
- Server Actions de tutores e pets: zero rows → mensagem genérica (sem vazar tenant)
- Rota dev `/api/dev/security-context` (somente development)
- Documentação: `docs/TENANT_ISOLATION_AUDIT.md`, `docs/RLS_AUDIT.sql`
- Atualização: `docs/SECURITY.md`, `docs/RLS_TEST_PLAN.md`
- Testes: `src/lib/security/uuid.test.ts`, `src/lib/security/tenant-access.test.ts`

### Não incluído

- Novas funcionalidades de negócio (agenda, serviços, financeiro, etc.)
- service_role na aplicação

## [0.5.0] — 2026-08-05

### Adicionado

- CRUD de tutores (`customers`) e pets com multi-tenancy e RLS
- Migration `customers` + `pets` com FK composta e soft delete
- Páginas: `/dashboard/tutores`, `/dashboard/pets` e sub-rotas completas
- Server Actions, schemas Zod, consultas paginadas e busca server-side
- Helpers de telefone brasileiro (`src/lib/phone.ts`)
- Métricas reais no dashboard: tutores e pets cadastrados
- Documentação: `docs/CUSTOMERS_PETS.md`, `docs/CUSTOMERS_PETS_TEST_PLAN.md`
- 16 testes unitários adicionais (schemas, telefone, paginação)

### Não incluído

- Agenda, serviços, atendimentos, financeiro, estoque, upload de foto, assinatura

## [0.4.0] — 2026-08-05

### Adicionado

- Autenticação real: cadastro, login, logout, recuperação e alteração de senha
- Confirmação de e-mail SSR (`/auth/confirm` com `verifyOtp` + token_hash)
- Callback PKCE (`/auth/callback` com `exchangeCodeForSession`)
- Onboarding multi-tenant (`/onboarding` + RPC `complete_onboarding`)
- Proxy de sessão Next.js 16 (`src/proxy.ts` + `getClaims()`)
- Proteção server-side do dashboard com membership via RLS
- Migration SQL multi-tenant: `profiles`, `companies`, `company_members`, RLS e helpers
- Schemas Zod reutilizáveis e Server Actions em `src/features/auth/`
- Páginas: `/verifique-email`, `/recuperar-senha`, `/nova-senha`, `/auth/erro`
- Perfil em `/dashboard/configuracoes` com dados reais e alteração de senha
- Tipos reais em `src/types/database.types.ts`
- Testes unitários de schemas, safe redirect e helpers
- Documentação: `docs/AUTH.md`, `docs/RLS_TEST_PLAN.md`

### Não incluído

- Tutores, pets, serviços, agenda, ordens de serviço, financeiro, estoque
- Convites de funcionários, assinatura, Mercado Pago, Stripe, WhatsApp, IA
- Service role, SMTP próprio, rate limiting dedicado

## [0.3.0] — 2026-08-05

### Adicionado

- Integração inicial com Supabase via `@supabase/supabase-js` e `@supabase/ssr`
- Validação tipada de variáveis públicas em `src/lib/env/public-env.ts`
- Cliente browser (`src/lib/supabase/client.ts`) com `createBrowserClient`
- Cliente server (`src/lib/supabase/server.ts`) com `createServerClient` e cookies do Next.js 16
- Verificação segura de conexão em `src/lib/supabase/connection-check.ts`
- Rota de diagnóstico temporária `GET /api/dev/supabase-health` (somente desenvolvimento)
- Placeholder de tipos do banco em `src/types/database.types.ts`
- Testes unitários para validação de env e configuração Supabase
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no `.env.example`

### Não incluído

- Autenticação funcional, middleware de sessão, tabelas de negócio, RLS, secret keys

## [0.2.0] — 2026-08-05

### Adicionado

- Identidade visual temporária com paleta esmeralda e tipografia Plus Jakarta Sans
- Landing page completa: hero, benefícios, como funciona, preços e CTA final
- Prévia visual do dashboard na página inicial
- Componentes de marketing, autenticação demonstrativa e dashboard refinados
- `ButtonLink` para navegação acessível sem warnings do Base UI
- Dados demonstrativos expandidos (agenda, financeiro, clientes recentes)
- Menu responsivo no cabeçalho público

### Corrigido

- 10 issues do indicador Next.js causados por `Button` + `Link` com semântica incorreta
- Hierarquia visual, espaçamentos, contraste e responsividade geral

### Não incluído

- Supabase, autenticação real, banco de dados e funcionalidades de negócio

## [0.1.0] — 2026-07-31

### Adicionado

- Fundação do projeto PetGestor com Next.js, TypeScript, Tailwind e shadcn/ui
- Página pública inicial com CTAs provisórios
- Páginas provisórias `/entrar`, `/cadastro` e `/dashboard`
- Layout responsivo do dashboard com sidebar e menu mobile
- Componentes de estado (loading, empty, error, not-found)
- Configuração centralizada de marca em `src/config/brand.ts`
- Regras permanentes do Cursor em `.cursor/rules/`
- Documentação inicial em `docs/`
- Vitest, ESLint, Prettier e scripts de validação
- `.env.example` preparado para Supabase (próxima etapa)

### Não incluído

- Supabase, autenticação, banco de dados e funcionalidades de negócio
