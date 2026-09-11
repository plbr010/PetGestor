# PDV — Venda de produtos

Módulo de ponto de venda integrado ao estoque e ao financeiro.

## Fluxo

1. Buscar produto (nome, SKU, código de barras) ou filtrar por categoria
2. Adicionar ao carrinho com quantidade (decimal quando unidade fracionada)
3. Cliente opcional
4. Desconto fixo ou percentual (servidor valida tipo, limite e `pos.apply_discount`)
5. Pagamento único, dividido ou parcial (dinheiro, Pix, cartões, transferência, outro)
6. Finalização atômica via RPC `complete_product_sale` — preço/total calculados no servidor
7. Pagamento adicional em venda parcial via RPC `register_sale_payment`
8. Caixa: abrir → operar → fechar (`open_cash_session` / `close_cash_session`)

## Autoridade de preço e total

- O cliente **não** define `unit_price`, `line_total` nem `total`
- O banco busca o produto por `company_id + product_id` e usa `products.sale_price_cents`
- Snapshot oficial em `sale_items.unit_price_cents`
- Subtotal da linha = preço oficial × quantidade; total = soma − desconto validado
- Total final ≤ 0 é rejeitado (`sale_total_zero`)

## Saldo e pagamentos

- Total / pago / saldo pendente (nunca negativo)
- Status `partially_paid` ou `completed` (`Pago / concluído`)
- Pagamentos adicionais só enquanto houver saldo; valor não pode exceder o restante
- Cada pagamento permanece individual (método, valor, data, `created_by`)
- Idempotência por `idempotency_key` na venda (com fingerprint) e em cada pagamento
- `financial_payments` é a fonte canônica do recebido (BLOCO 5)

## Dinheiro recebido e troco

- `sales.cash_received_cents` = quanto o cliente **entregou** em dinheiro
- `financial_payments` cash = quanto desse dinheiro foi **aplicado** à venda
- `sales.change_cents` = tendered − applied cash — **não** é receita, payment nem faturamento
- Sem pagamento em dinheiro → troco = 0
- Exemplo misto: venda R$100, Pix R$30, cash received R$100 → Pix R$30 + cash payment R$70 + troco R$30

## Estoque

- Baixa via `register_stock_movement` com `type = sale` e `reference_type = sale`
- FEFO em lotes (mesma regra do estoque); lotes vencidos excluídos do disponível
- Concorrência: `SELECT … FOR UPDATE` + `UPDATE … WHERE current_stock = previous AND new >= 0`
- Estoque nunca fica negativo; duas vendas da última unidade: uma vence, a outra `insufficient_stock`

## Financeiro

- Receita em `financial_entries` com `source_type = sale` (um lançamento por venda)
- Pagamentos adicionais atualizam o mesmo lançamento — sem duplicar receita
- Venda paga **não** é cancelada neste bloco (`sale_paid_requires_refund`)
- Sem estorno em gateway/adquirente

## Caixa

- Uma sessão aberta por empresa
- Recebimento em dinheiro exige caixa aberto **no servidor** (`cash_session_required`)
- Resumo por método: dinheiro, PIX, débito, crédito, transferência, outros
- Contabiliza apenas valores **efetivamente recebidos** no período (`financial_payments.paid_at`)
- Dinheiro físico esperado = saldo inicial + entradas em dinheiro (payment aplicado, não tendered)
- PIX/cartão entram no resumo, mas não no saldo do gaveteiro
- Retry não duplica movimento de caixa (idempotência do payment)

## Permissões

| Permissão | Uso |
|-----------|-----|
| `pos.use` | Operar PDV / ver vendas |
| `pos.apply_discount` | Desconto |
| `pos.receive_payment` | Registrar pagamento em parcial |
| `pos.cancel_sale` | Cancelar venda (somente `open` sem pagamento) |
| `pos.close_cash` | Abrir/fechar caixa (`/dashboard/pdv/caixa`) |

## Segurança

- RLS em `sales`, `sale_items`, `financial_payments`, `cash_sessions`
- `company_id` derivado no servidor (RPC SECURITY DEFINER + membership + `p_company_id`)
- Cross-tenant: `not_found` genérico (não revela existência)

## Migrations

- `supabase/migrations/20260818140000_point_of_sale.sql`
- `supabase/migrations/20260825160000_pdv_finalize.sql`
- `supabase/migrations/20260911300000_pdv_server_side_price_checkout.sql` (**BLOCO 6 — aplicar no Supabase**)
- Diagnóstico somente leitura: `docs/sql/diagnose-bloco-6-pdv.sql`

## Tabelas

- `sales` — cabeçalho da venda (número, totais, `cash_received_cents`, troco, fingerprint)
- `sale_items` — itens com snapshot de preço oficial e custo
- `financial_payments` — pagamentos divididos/parciais (fonte canônica do recebido)
- `cash_sessions` — abertura/fechamento de caixa do PDV

## Limitações (fora de escopo / adiado)

- Sem NFC-e, SAT, TEF, maquininha ou gateway novo
- Sem comissão, cashback ou pontos
- **Devolução parcial de itens** e **refund/estorno de venda paga** não implementados; cancelamento de venda paga é bloqueado
- Relatórios gerais do PDV não foram refeitos neste bloco
