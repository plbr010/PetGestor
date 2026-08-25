# PDV — Venda de produtos

Módulo de ponto de venda integrado ao estoque e ao financeiro.

## Fluxo

1. Buscar produto (nome, SKU, código de barras) ou filtrar por categoria
2. Adicionar ao carrinho com quantidade (decimal quando unidade fracionada)
3. Cliente opcional
4. Desconto fixo ou percentual
5. Pagamento único, dividido ou parcial (dinheiro, Pix, cartões, transferência, outro)
6. Finalização atômica via RPC `complete_product_sale`
7. Pagamento adicional em venda parcial via RPC `register_sale_payment`
8. Caixa: abrir → operar → fechar (`open_cash_session` / `close_cash_session`)

## Tabelas

- `sales` — cabeçalho da venda (número sequencial, totais, troco, auditoria)
- `sale_items` — itens com snapshot de preço e custo
- `financial_payments` — pagamentos divididos/parciais por lançamento
- `cash_sessions` — abertura/fechamento de caixa do PDV

## Saldo e pagamentos

- Total / pago / saldo pendente (nunca negativo)
- Status `partially_paid` ou `completed` (`Pago / concluído`)
- Pagamentos adicionais só enquanto houver saldo; valor não pode exceder o restante
- Cada pagamento permanece individual (método, valor, data, `created_by`)
- Idempotência por `idempotency_key` na venda e em cada pagamento

## Estoque

- Baixa via `register_stock_movement` com `type = sale` e `reference_type = sale`
- FEFO em lotes (mesma regra do estoque); lotes vencidos excluídos do disponível
- Cancelamento devolve estoque com movimentação `return` (não apaga a saída original)

## Financeiro

- Receita em `financial_entries` com `source_type = sale` (um lançamento por venda)
- Pagamentos adicionais atualizam o mesmo lançamento — sem duplicar receita
- Cancelamento marca venda, pagamentos e lançamento como cancelados (não apaga histórico)
- Sem estorno em gateway/adquirente (registro interno apenas)

## Caixa

- Uma sessão aberta por empresa
- Resumo por método: dinheiro, PIX, débito, crédito, transferência, outros
- Contabiliza apenas valores **efetivamente recebidos** no período (`financial_payments.paid_at`)
- Dinheiro físico esperado = saldo inicial + entradas em dinheiro
- PIX/cartão entram no resumo, mas não no saldo do gaveteiro

## Permissões

| Permissão | Uso |
|-----------|-----|
| `pos.use` | Operar PDV / ver vendas |
| `pos.apply_discount` | Desconto |
| `pos.receive_payment` | Registrar pagamento em parcial |
| `pos.cancel_sale` | Cancelar venda |
| `pos.close_cash` | Abrir/fechar caixa (`/dashboard/pdv/caixa`) |

## Segurança

- RLS em `sales`, `sale_items`, `financial_payments`, `cash_sessions`
- `company_id` derivado no servidor (RPC SECURITY DEFINER + membership)
- Concorrência de estoque via RPC (impede estoque negativo)

## Migrations

- `supabase/migrations/20260818140000_point_of_sale.sql`
- `supabase/migrations/20260825160000_pdv_finalize.sql` (**aplicar no Supabase**)
- Atalho: `docs/sql/APPLY-pdv-finalize.sql`

## Limitações (fora de escopo / adiado)

- Sem NFC-e, SAT, TEF, maquininha ou gateway novo
- Sem comissão, cashback ou pontos
- **Devolução parcial de itens** não implementada nesta etapa (risco de inconsistência estoque/financeiro); cancelamento total com devolução de estoque já existe
