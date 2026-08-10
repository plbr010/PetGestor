# PetGestor — Financeiro (Etapa 9)

## Escopo

Módulo de **controle financeiro operacional** do pet shop. Não substitui contabilidade profissional, DRE contábil ou emissão fiscal.

Valores monetários são armazenados em **centavos inteiros** (`INTEGER`), nunca em `float`.

## Fluxo principal

```text
Atendimento pronto (service_order → ready)
    ↓ (mesma transação RPC)
financial_entry income / pending / service_order
    ↓ (pagamento explícito)
financial_entry → paid
```

Finalizar entrega (`ready → completed`) **não** marca pagamento automaticamente.

## Tabela `financial_entries`

| Campo | Descrição |
|-------|-----------|
| `entry_type` | `income` (Receita) ou `expense` (Despesa) |
| `status` | `pending`, `paid`, `cancelled` |
| `source_type` | `service_order` ou `manual` |
| `service_order_id` | Obrigatório quando origem = atendimento |
| `amount_cents` | Valor em centavos |
| `payment_method` | Obrigatório quando `status = paid` |
| `paid_at` | Timestamp do pagamento |
| `cancelled_at` | Cancelamento lógico (sem DELETE) |

## Valor de atendimentos

Sempre de `appointments.price_cents_snapshot` — **nunca** do preço atual do serviço.

## Regras de negócio

### Geração automática

- Ao marcar atendimento como **pronto**, RPC `mark_service_order_ready` cria receita pendente.
- UNIQUE parcial impede duplicação por retry/clique repetido.
- Idempotente: se já existir, não cria outra.

### Pagamento

- `markFinancialEntryPaidAction` → RPC `mark_financial_entry_paid`.
- Exige forma de pagamento; `paid_at` padrão = agora.

### Reabertura (correção operacional)

- `reopenFinancialEntryAction` → RPC `reopen_financial_entry`.
- `paid → pending`; limpa `paid_at` e `payment_method`.
- Não é estorno bancário — documentado para MVP.

### Cancelamento

- Lançamentos **manuais**: canceláveis.
- Lançamentos de **atendimento**: **não** canceláveis manualmente (RPC bloqueia).
- Usar `cancelled_at` + `status = cancelled` — sem DELETE físico.

### Edição

- Somente `source_type = manual`.
- Valor bloqueado enquanto `paid` — reabrir primeiro.

## Formas de pagamento

| Código | Label |
|--------|-------|
| `cash` | Dinheiro |
| `pix` | Pix |
| `debit_card` | Cartão de débito |
| `credit_card` | Cartão de crédito |
| `bank_transfer` | Transferência |
| `other` | Outro |

## Categorias (MVP)

Texto livre opcional (`category`), com sugestões na UI:

- Receitas: Serviços, Venda avulsa, Outros
- Despesas: Produtos, Aluguel, Energia, Água, Marketing, Equipamentos, Manutenção, Outros

## Resumos

| Métrica | Cálculo |
|---------|---------|
| Resultado realizado | receitas pagas − despesas pagas |
| Resultado projetado | receitas não canceladas − despesas não canceladas |
| Pendentes | não entram no realizado |

## Rotas

| Rota | Descrição |
|------|-----------|
| `/dashboard/financeiro` | Listagem, filtros, resumo, pendentes |
| `/dashboard/financeiro/nova-receita` | Receita manual |
| `/dashboard/financeiro/nova-despesa` | Despesa manual |
| `/dashboard/financeiro/[id]` | Detalhe e ações |

Query params: `from`, `to`, `preset`, `type`, `status`, `payment`, `q`, `page`.

## Feature

`src/features/finance/` — actions, queries, schemas, types, status, utils, components.

## Migration

`supabase/migrations/20260806081500_finance.sql`

**MIGRATION PENDENTE** até aplicação manual no Supabase.

## Não incluído

NF, boleto, Pix automático, conciliação bancária, DRE contábil, comissão, estoque, assinatura SaaS, trial.
