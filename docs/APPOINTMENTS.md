# PetGestor — Agenda (Appointments)

## Visão geral

A Etapa 7 implementa a **agenda real** do pet shop: criação, visualização (dia/semana), edição, confirmação, cancelamento e marcação de falta.

Feature: `src/features/appointments/`

Rotas:

- `/dashboard/agenda` — visualização dia/semana, filtros
- `/dashboard/agenda/novo` — novo agendamento
- `/dashboard/agenda/[id]` — detalhe
- `/dashboard/agenda/[id]/editar` — edição/reagendamento

## Timezone

- Coluna `companies.timezone` (default `America/Sao_Paulo`)
- Banco: `TIMESTAMPTZ` para `scheduled_start` / `scheduled_end`
- App: conversão local ↔ UTC em `src/lib/timezone.ts`
- Validação de jornada na RPC usa `timezone(company.timezone, scheduled_start)`

**Nunca** salvar strings de horário local como se fossem UTC.

## Snapshots de serviço

No momento da criação (e recálculo na edição quando serviço/porte mudam), o servidor grava:

- `service_name_snapshot`
- `price_cents_snapshot`
- `duration_minutes_snapshot`
- `pet_size` (quando `by_size`)

Preço e duração exibidos em agendamentos históricos vêm **sempre** dos snapshots — nunca do preço atual do serviço.

### Regra de recálculo na edição

- Só data/funcionário mudam → **mantém** snapshots existentes
- Serviço ou porte mudam → **recalcula** snapshots

## Preços

| Modo | Fonte no servidor |
|------|-------------------|
| `fixed` | `services.price_cents`, `services.duration_minutes` |
| `by_size` | `service_size_prices` para o porte selecionado |

O navegador mostra preview; o servidor recalcula e valida.

## Integridade tutor/pet

- `customer_id` é **derivado do pet** no RPC — não confiar no formulário
- FK composta `(pet_id, customer_id, company_id)` → `pets`

## Integridade funcionário/serviço

- FK composta `(employee_id, service_id, company_id)` → `employee_services`
- Impede agendar serviço que o profissional não executa

## Conflitos de horário

**Duas camadas:**

1. RPC verifica overlaps antes do INSERT/UPDATE
2. PostgreSQL EXCLUDE com `tstzrange(..., '[)')` para employee e pet

Range half-open `[)`: 10:00–11:00 e 11:00–12:00 são permitidos; overlaps parciais não.

Aplica a status: `scheduled`, `confirmed`, `in_progress` com `deleted_at IS NULL`.

Cancelados e no-show **não bloqueiam** horário.

## Jornada do funcionário

Validada na RPC com `employee_working_hours` e timezone da empresa:

- Dia da semana local
- Início e fim do agendamento dentro do intervalo do dia

## Status e transições

| Status | Label |
|--------|-------|
| scheduled | Agendado |
| confirmed | Confirmado |
| in_progress | Em atendimento |
| completed | Finalizado |
| cancelled | Cancelado |
| no_show | Não compareceu |

Transições nesta etapa:

- scheduled → confirmed, cancelled, no_show
- confirmed → cancelled, no_show

Helper: `src/features/appointments/status.ts`

## RPC transacionais

| RPC | Uso |
|-----|-----|
| `create_appointment` | Criação atômica com todas as validações |
| `update_appointment` | Edição/reagendamento atômico |

`SECURITY DEFINER`, `search_path` seguro, `EXECUTE` apenas `authenticated`, `auth.uid()` obrigatório.

## RLS

- SELECT/UPDATE: membros da empresa
- INSERT: membros + `created_by = auth.uid()`
- Sem DELETE físico pela aplicação
- `prevent_company_change()` em appointments

## Concorrência

Duas requisições simultâneas para o mesmo horário/profissional: a RPC pode passar em ambas, mas a **EXCLUDE constraint** aceita somente uma. Documentado em `docs/APPOINTMENTS_TEST_PLAN.md`.

## Migration

**MIGRATION PENDENTE:** `supabase/migrations/20260806073000_appointments.sql`

Aplicar no Supabase SQL Editor após migrations das Etapas 4–6.

## Não implementado

Ordem de serviço, pagamento, financeiro, estoque, comissão, WhatsApp, drag-and-drop, recorrência, fluxo completo de atendimento (`in_progress` / `completed`).
