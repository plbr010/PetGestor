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

**Importante:** quando o serviço termina (`ready`), o appointment fica `completed` (serviço contratado concluído). O pet ainda aguarda retirada — a ordem fica `ready`.

## Check-in

RPC `check_in_appointment`:

- Idempotente: se ordem já existe, retorna id existente (UNIQUE `appointment_id` como proteção final)
- Rejeita appointment `cancelled`, `no_show`, `completed`
- Permite check-in mesmo com horário passado (atrasos normais)
- `scheduled` → `confirmed` automaticamente no check-in

## Cancelamento

Somente `waiting → cancelled`. Ordens em `in_progress` não podem ser canceladas nesta etapa.

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
| `mark_service_order_ready` | Serviço concluído |
| `complete_service_order` | Entrega ao tutor |
| `cancel_service_order` | Cancelar ordem aguardando |
| `update_service_order_notes` | Atualizar observações |

`SECURITY DEFINER`, `auth.uid()` obrigatório, `EXECUTE` apenas `authenticated`.

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

**MIGRATION PENDENTE:** `supabase/migrations/20260806080000_service_orders.sql`
