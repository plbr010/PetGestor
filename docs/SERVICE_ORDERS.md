# PetGestor — Ordens de Serviço (Atendimentos)

## Visão geral

A Etapa 8 implementa o **fluxo operacional de atendimento** do pet shop, a partir de agendamentos existentes.

Feature: `src/features/service-orders/`

Rotas:

- `/dashboard/atendimentos` — fila operacional e histórico
- `/dashboard/atendimentos/[id]` — detalhe da ordem

Check-in também disponível em `/dashboard/agenda/[id]`.

## Separação appointment × service_order

| Entidade | Responsabilidade |
|----------|------------------|
| `appointments` | Agendamento comercial + snapshots (preço, duração, serviço) |
| `service_orders` | Fluxo operacional (chegada → atendimento → pronto → entrega) |

**Não duplicamos snapshots** na ordem de serviço. Pet, tutor, serviço, preço e funcionário vêm do appointment via join.

## Fluxo operacional

```text
Agendamento → Pet chegou (check-in) → Aguardando → Em atendimento → Pronto para buscar → Entregue/Finalizado
```

### Status da ordem

| Status | Label |
|--------|-------|
| waiting | Aguardando |
| in_progress | Em atendimento |
| ready | Pronto para buscar |
| completed | Finalizado |
| cancelled | Cancelado |

### Sincronização com appointment

| Operação | service_order | appointment |
|----------|---------------|-------------|
| Check-in | waiting (cria) | scheduled → **confirmed** |
| Iniciar | waiting → in_progress | → **in_progress** |
| Marcar pronto | in_progress → ready | in_progress → **completed** |
| Finalizar entrega | ready → completed | permanece **completed** |
| Cancelar OS | waiting → cancelled | scheduled/confirmed → **cancelled** |
| Cancelar/no-show na agenda | waiting → cancelled | cancelled / no_show |

**Regra explícita:** cancelar a OS **cancela o atendimento** daquele agendamento na mesma transação. Não existe `appointment = confirmed` + `OS = cancelled`. Não há reabertura automática de OS cancelada; novo check-in é rejeitado com `service_order_cancelled`.

**Importante:** quando o serviço termina (`ready`), o appointment fica `completed` (serviço contratado concluído). O pet ainda aguarda retirada — a ordem fica `ready`.

### Máquina de estados

| Estado atual | Ações permitidas | Próximo estado |
|--------------|------------------|----------------|
| waiting | Iniciar atendimento | in_progress |
| waiting | Cancelar atendimento | cancelled |
| in_progress | Marcar como pronto | ready |
| ready | Finalizar entrega | completed |
| completed | — (terminal) | — |
| cancelled | — (terminal) | — |

Retry da mesma ação (duas abas / timeout) é **idempotente**: devolve o estado atual sem repetir efeitos. Transições inválidas (`waiting → completed`, `cancelled → ready`, `completed → in_progress`, `in_progress → cancelled`) falham de forma controlada.

Cancelar `in_progress` ou `ready` **não é permitido** nesta etapa (estoque/receita já podem ter sido aplicados em `ready`).

## Insumos e estoque

1. Configure a receita em **Serviços** (produtos + quantidade padrão na unidade do produto).
2. No check-in, a OS recebe cópia editável em `service_order_consumptions`.
3. Antes de marcar pronto: ajuste quantidade real, adicione ou remova insumos.
4. **Marcar como pronto** baixa o estoque (FEFO, idempotente). Entrega (`completed`) não mexe no estoque.
5. Cancelamento só em `waiting` — antes da baixa. Não há reabertura de OS nesta etapa.

Custo de insumos é gerencial (não altera o preço do cliente). Exibido a quem tem `inventory.view`.

## Check-in

RPC `check_in_appointment`:

- Idempotente de verdade: `SELECT … FOR UPDATE` no appointment + `INSERT … ON CONFLICT (appointment_id) DO NOTHING`
- Duas chamadas simultâneas resultam em **uma** OS e o mesmo `id`
- `unique_violation` é capturado internamente — não chega à UI
- Se já existe OS operacional (`waiting` / `in_progress` / `ready`), retry devolve a mesma OS
- Se a OS existente está `cancelled`, erro acionável `service_order_cancelled` (não devolve a OS cancelada como ativa)
- Rejeita appointment `cancelled`, `no_show`, `completed`, de outra empresa, ou sem permissão
- Permite check-in mesmo com horário passado (atrasos normais)
- `scheduled` → `confirmed` somente na criação (CAS `WHERE status = 'scheduled'`)

## Cancelamento

Somente `waiting → cancelled`. Ordens em `in_progress`/`ready`/`completed` não podem ser canceladas nesta etapa.

O appointment ligado é sincronizado para `cancelled` (motivo `Atendimento cancelado` se ainda não houver). Pacote, se houver, é estornado pelo trigger já existente de cancelamento de agendamento.

Retry de cancelamento é idempotente. Não há reabertura automática.

## Timestamps (timestamptz UTC)

| Campo | Transição |
|-------|-----------|
| `check_in_at` | criação da OS |
| `started_at` | waiting → in_progress (`COALESCE`, retry não sobrescreve) |
| `ready_at` | in_progress → ready |
| `completed_at` | ready → completed |
| `cancelled_at` | waiting → cancelled |

Exibição continua no timezone da empresa.

## Observações

| Campo | Uso | Limite |
|-------|-----|--------|
| intake_notes | Recebimento do pet | 3000 |
| internal_notes | Operação interna | 5000 |
| completion_notes | Finalização/entrega | 3000 |

## RPCs transacionais

| RPC | Uso |
|-----|-----|
| `check_in_appointment` | Receber pet |
| `start_service_order` | Iniciar atendimento |
| `mark_service_order_ready` | Serviço concluído + baixa de insumos |
| `complete_service_order` | Entrega ao tutor |
| `cancel_service_order` | Cancelar ordem aguardando |
| `update_service_order_notes` | Atualizar observações |
| `seed_service_order_consumptions` | Garantir seed da receita |
| `upsert_service_order_consumption` | Ajustar/adicionar insumo |
| `remove_service_order_consumption` | Remover insumo antes da baixa |

A ficha do **cadastro de serviço** é gravada atômicamente em `create_service_with_prices` / `update_service_with_prices` (BLOCO 8.1). `replace_service_product_recipes` permanece como rotina interna da mesma transação.

`SECURITY DEFINER`, `auth.uid()` obrigatório, `p_company_id` explícito + `require_app_permission('service_orders.update_status')`, `EXECUTE` apenas `authenticated`.

Retorno jsonb `{ id, status, changed, idempotent, created }`. Efeitos derivados só quando `changed = true`.

## RLS

- SELECT/UPDATE: membros da empresa
- INSERT: membros + `created_by = auth.uid()`
- Sem DELETE físico
- `prevent_company_change()` em updates

## Preparação para financeiro (futuro)

Quando `service_order` atinge `ready` ou `completed`, o módulo financeiro poderá gerar receita/conta a receber usando:

- `appointment.price_cents_snapshot` (nunca preço atual do serviço)

Possível extensão futura: `service_order_items` para extras (hidratação, unhas, produtos).

**Não implementado nesta etapa:** pagamento, contas a receber, caixa, estoque, comissões.

## Migration

**MIGRATION PENDENTE (BLOCO 3):** `supabase/migrations/20260911180000_service_order_state_machine_concurrency.sql`

Não reaplica BLOCO 1 (`20260911120000_authorization_rls_tenant_isolation.sql`) nem BLOCO 2 (`20260911153000_agenda_civil_date_working_hours_recurrence.sql`).

A migration original da etapa 8 permanece: `supabase/migrations/20260806080000_service_orders.sql`.
