# PetGestor — Financeiro (Etapa 9+)

## Escopo

Módulo de **controle financeiro operacional** do pet shop. Não substitui contabilidade profissional, DRE contábil ou emissão fiscal.

Valores monetários são armazenados em **centavos inteiros** (`INTEGER`), nunca em `float`.

## Fluxo principal

```text
Atendimento pronto (service_order → ready)
    ↓ (mesma transação RPC)
financial_entry income / pending / service_order
    ↓ (um ou mais pagamentos)
financial_payments (amount + método + paid_at)
    ↓
financial_entry.status = pending | partially_paid | paid
```

Pacote vendido (`source_type = service_package`) gera **uma** cobrança. Uso do pacote no atendimento **não** cria nova receita.

Finalizar entrega (`ready → completed`) **não** marca pagamento automaticamente.

## Tabelas

### `financial_entries`

| Campo | Descrição |
|-------|-----------|
| `entry_type` | `income` (Receita) ou `expense` (Despesa) |
| `status` | `pending`, `partially_paid`, `paid`, `cancelled` |
| `source_type` | `service_order`, `manual` ou `service_package` |
| `service_order_id` | Obrigatório quando origem = atendimento |
| `amount_cents` | Valor total da cobrança em centavos |
| `payment_method` | Último método quando `status = paid` (compatibilidade) |
| `paid_at` | Timestamp do último pagamento quando quitado |
| `cancelled_at` | Cancelamento lógico (sem DELETE) |

### `financial_payments`

Múltiplos pagamentos por lançamento. Soft-cancel via `cancelled_at` (estorno interno, sem integração bancária).

| Campo | Descrição |
|-------|-----------|
| `amount_cents` | Valor deste pagamento (> 0) |
| `payment_method` | `cash`, `pix`, `debit_card`, `credit_card`, `bank_transfer`, `other` |
| `paid_at` | Data/hora efetiva (timezone da empresa na UI) |
| `idempotency_key` | Evita duplo registro (retry/clique duplo) |
| `cancelled_at` | Estorno interno |

Saldo restante = `entry.amount_cents − SUM(pagamentos ativos)`. Pagamento acima do restante é bloqueado (`payment_exceeds_balance`).

### `cash_closings`

Snapshot diário. Fechar o caixa **não** altera pagamentos nem atendimentos.

Reabertura apenas `owner`/`admin`, com `reopened_at` / `reopened_by`.

## Valor de atendimentos

Sempre de `appointments.price_cents_snapshot` — **nunca** do preço atual do serviço.

## Regras de negócio

### Geração automática

- Ao marcar atendimento como **pronto**, RPC `mark_service_order_ready` cria receita pendente.
- UNIQUE parcial impede duplicação por retry/clique repetido.

### Pagamento

- `recordFinancialPaymentAction` → RPC `record_financial_payment`.
- `mark_financial_entry_paid` permanece como atalho (paga o saldo restante).
- Status derivado: 0 pago → `pending`; parte → `partially_paid`; 100% → `paid`.

### Estorno interno

- `cancelFinancialPaymentAction` → RPC `cancel_financial_payment`.
- Recalcula saldo e status. Não é estorno de cartão/PIX.

### Reabertura da cobrança

- Cancela todos os pagamentos ativos e volta a `pending`.

### Cancelamento do lançamento

- Manuais e pacotes: canceláveis (estorna pagamentos ativos).
- Atendimento: **não** cancelável manualmente.

### Edição

- Somente `source_type = manual`.
- Valor bloqueado enquanto `paid` ou `partially_paid` — reabrir primeiro.

## Formas de pagamento

| Código | Label |
|--------|-------|
| `cash` | Dinheiro |
| `pix` | Pix |
| `debit_card` | Cartão de débito |
| `credit_card` | Cartão de crédito |
| `bank_transfer` | Transferência |
| `other` | Outro |

## Resumos

| Métrica | Cálculo |
|---------|---------|
| Receita gerada | soma de receitas não canceladas (valor total) |
| Receita recebida | soma de pagamentos ativos de receitas |
| Receita pendente | saldo restante de receitas `pending`/`partially_paid` |
| Resultado realizado | receita recebida − despesas pagas |
| Fechamento do dia | somente pagamentos com `paid_at` no dia local da empresa |

O **dia comercial** usa `companies.timezone`, não UTC puro.

## Rotas

| Rota | Descrição |
|------|-----------|
| `/dashboard/financeiro` | Listagem, filtros, resumo, pendentes |
| `/dashboard/financeiro/fechamento` | Fechamento de caixa (hoje / ontem / data) |
| `/dashboard/financeiro/nova-receita` | Receita manual |
| `/dashboard/financeiro/nova-despesa` | Despesa manual |
| `/dashboard/financeiro/[id]` | Detalhe, histórico e pagamentos parciais |

## Feature

`src/features/finance/` — actions, queries, schemas, types, status, utils, components, `payments/`.

## Migrations

- `supabase/migrations/20260806081500_finance.sql`
- `supabase/migrations/20260817190000_partial_payments_cash_closing.sql`

**MIGRATION PENDENTE** até aplicação manual no Supabase.

## Não incluído

NF, boleto, Pix automático, maquininha, conciliação bancária, DRE contábil, contas bancárias, cobrança automática, estoque, comissão.
