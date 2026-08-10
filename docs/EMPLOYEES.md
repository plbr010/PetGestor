# PetGestor — Funcionários (Etapa 6)

## Visão geral

Módulo operacional de **funcionários** — pessoas que trabalham no pet shop (tosador, banhista, veterinário, atendente, etc.).

**Importante:** `employees` ≠ `company_members`.

| Conceito | Tabela | Significado |
|----------|--------|-------------|
| Usuário do SaaS | `company_members` | Acesso ao sistema (login) |
| Funcionário operacional | `employees` | Pessoa que trabalha no pet shop |

Um funcionário **pode existir sem login**. Relacionamento employee ↔ company_member é **futuro** — não implementado nesta etapa.

## Modelo de dados

```text
companies → employees → employee_services → services
                     → employee_working_hours
```

### `public.employees`

| Campo | Descrição |
|-------|-----------|
| `active` | Inativo continua cadastrado; não aparece em novos agendamentos futuros |
| `can_be_scheduled` | Pode receber agendamentos (ex.: atendente pode ser false) |
| `deleted_at` | Arquivamento (soft delete) |

### `public.employee_services`

Relacionamento N:N entre funcionário e serviços que executa. FK composta impede cross-tenant.

### `public.employee_working_hours`

Jornada semanal — **MVP: um intervalo por dia**.

| weekday | Dia |
|---------|-----|
| 0 | Domingo |
| 1 | Segunda |
| ... | ... |
| 6 | Sábado |

Quando `enabled = true`: `start_time` e `end_time` obrigatórios, com `start_time < end_time`.

**Futuro:** múltiplos turnos por dia; folgas excepcionais (férias, feriados) virão com a Agenda.

## RPC transacionais

| RPC | Função |
|-----|--------|
| `create_employee_with_schedule` | Cria employee + serviços + horários atomicamente |
| `update_employee_with_schedule` | Atualiza tudo; recria vínculos de serviços e horários |

Ao atualizar `employee_services`: DELETE físico das associações antigas + INSERT das novas (tabela auxiliar).

## Segurança

- `company_id` e `created_by` somente server-side
- RLS em todas as tabelas
- Trigger `prevent_company_change`
- IDOR → `notFound()` nas rotas `[id]`

## Rotas

| Rota | Função |
|------|--------|
| `/dashboard/funcionarios` | Lista, busca, filtros, paginação |
| `/dashboard/funcionarios/novo` | Cadastro |
| `/dashboard/funcionarios/[id]` | Detalhes |
| `/dashboard/funcionarios/[id]/editar` | Edição |

## Preparação para Agenda (documentação)

Na Etapa 7 (Agenda), considerar:

- `employee.active`
- `employee.can_be_scheduled`
- `employee_services`
- `employee_working_hours`
- Duração do serviço
- Conflitos de horário

**Não implementado:** férias, atestados, feriados, bloqueios pontuais.

## Migration

`supabase/migrations/20260806071500_employees.sql`

**MIGRATION PENDENTE** — aplicar manualmente no Supabase.
