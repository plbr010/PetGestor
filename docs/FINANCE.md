# PetGestor — Financeiro

## Escopo

Módulo de **controle financeiro operacional** do pet shop. Não substitui contabilidade profissional, DRE contábil ou emissão fiscal.

Valores monetários são armazenados em **centavos inteiros** (`INTEGER`), nunca em `float`.

## Fonte de verdade (BLOCO 5)

| Dado | Onde vive |
|------|-----------|
| Valor faturado | `financial_entries.amount_cents` |
| Valor recebido | `SUM(financial_payments.amount_cents)` com `cancelled_at IS NULL` |
| Saldo a receber | `amount_cents − recebido` |
| Métodos reais | `financial_payments.payment_method` |
| Status derivado | `pending` / `partially_paid` / `paid` / `cancelled` |

`financial_entries.payment_method` e `paid_at` são **compatibilidade**:

- `paid`: último pagamento ativo (método + instante)
- `partially_paid`: ambos NULL
- não usar `payment_method` da entry sozinho para listar todos os métodos de um lançamento

**Legado:** `status = paid` sem nenhuma parcela ativa **não** gera linha histórica automaticamente. Totais usam `amount_cents` como recebido até haver reconciliação manual. Diagnóstico: `docs/sql/diagnose-bloco-5-finance.sql`.

Novos lançamentos manuais pagos geram `financial_payment` canônico na mesma operação (RPC + trigger de INSERT).

## Status

| status | recebido | saldo | comportamento |
|--------|----------|-------|----------------|
| `pending` | 0 | amount | a receber integral |
| `partially_paid` | 0 < r < amount | amount − r | a receber líquido |
| `paid` | amount | 0 | realizado |
| `cancelled` | — | 0 | fora dos totais |

Pagamento comum acima do saldo é rejeitado (`payment_exceeds_balance`).

## Fluxo principal

```text
Atendimento pronto (service_order → ready)
    ↓ (mesma transação RPC)
financial_entry income / pending / service_order
    ↓ (pagamento explícito, possivelmente parcial/misto)
financial_payments + status derivado
```

Finalizar entrega (`ready → completed`) **não** marca pagamento automaticamente.

Venda de pacote: `pending → paid` ativa o **mesmo** pacote (BLOCO 4). Pagamento parcial de pacote não libera crédito até o total.

## Origens que criam `financial_entries`

| Origem | Quando | Pagamentos |
|--------|--------|------------|
| `service_order` | OS pronta | via Financeiro (parcial permitido) |
| `service_package` | venda do pacote | via Financeiro; paid ativa o pacote |
| `sale` | PDV | via PDV (`register_sale_payment`) — não pagar/reabrir por aqui |
| `manual` | formulário | parcela canônica se criado como pago |

## Reabertura

| Origem | Permitida? |
|--------|------------|
| `manual` paid/partial | Sim — cancela pagamentos (`cancelled_at`), volta a `pending` |
| `service_order` | Não |
| `service_package` | Não |
| `sale` | Não |

Nunca DELETE físico de `financial_payments`.

## Cancelamento

| Origem / status | Permitido? |
|-----------------|------------|
| `manual` pending sem recebido | Sim |
| `manual` partial/paid | Não — exigiria estorno (fora deste bloco) |
| `service_order` / `sale` / `service_package` | Não por esta RPC |

## Período e timezone

Filtros de instante (`paid_at`, `created_at`) usam intervalo half-open no **fuso da empresa**:

`[início civil 00:00, 00:00 do dia seguinte ao último dia)`

`due_date` é data civil. Não usar `new Date("YYYY-MM-DD")`.

## Filtro por forma de pagamento

A lista mostra a **entry inteira** se existir ao menos um pagamento ativo naquele método (ou, no legado sem parcelas, se `financial_entries.payment_method` coincidir). Sem duplicar linhas. Sem cruzar `company_id`.

## Matemática compartilhada

Helpers: `src/features/finance/ledger.ts` e RPCs `private.sum_active_financial_payments` / `private.financial_entry_remaining_cents` / `private.register_financial_payment`.

Financeiro, dashboard, overview e recebíveis usam a mesma regra de recebido/saldo.

## Concorrência e idempotência

Antes de inserir pagamento: `SELECT … FOR UPDATE` na entry, recálculo do saldo, rejeição se `amount > remaining`.

`idempotency_key` única por empresa (pagamentos ativos). Retry com a mesma chave não duplica.

## Formas de pagamento

| Código | Label |
|--------|-------|
| `cash` | Dinheiro |
| `pix` | Pix |
| `debit_card` | Cartão de débito |
| `credit_card` | Cartão de crédito |
| `bank_transfer` | Transferência |
| `other` | Outro |

Validação alinhada em UI, Server Action, RPC e CHECK do banco.

## Rotas

| Rota | Descrição |
|------|-----------|
| `/dashboard/financeiro` | Listagem, filtros, resumo, pendentes |
| `/dashboard/financeiro/nova-receita` | Receita manual |
| `/dashboard/financeiro/nova-despesa` | Despesa manual |
| `/dashboard/financeiro/[id]` | Detalhe e ações |

## Migrations

- `supabase/migrations/20260806081500_finance.sql`
- `supabase/migrations/20260818140000_point_of_sale.sql` (`financial_payments`)
- `supabase/migrations/20260911220000_financial_payments_source_of_truth.sql` (**BLOCO 5 — aplicar no Supabase**)

## Não incluído neste bloco

PDV (troco, venda de produto, estoque), relatórios gerais, relatório de pacotes, assinatura SaaS, Mercado Pago billing, política ampla de refund.
