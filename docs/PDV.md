# PDV — Venda de produtos

Módulo de ponto de venda integrado ao estoque e ao financeiro.

## Fluxo

1. Buscar produto (nome, SKU, código de barras) ou filtrar por categoria
2. Adicionar ao carrinho com quantidade (decimal quando unidade fracionada)
3. Cliente opcional
4. Desconto fixo ou percentual
5. Pagamento único ou dividido (dinheiro, Pix, cartões, transferência, outro)
6. Finalização atômica via RPC `complete_product_sale`

## Tabelas

- `sales` — cabeçalho da venda (número sequencial, totais, troco, auditoria)
- `sale_items` — itens com snapshot de preço e custo
- `financial_payments` — pagamentos divididos/parciais por lançamento

## Estoque

- Baixa via `register_stock_movement` com `type = sale` e `reference_type = sale`
- FEFO em lotes (mesma regra do estoque); lotes vencidos excluídos do disponível
- Cancelamento devolve estoque com movimentação `return`

## Financeiro

- Receita em `financial_entries` com `source_type = sale`
- Status `partially_paid` quando pagamento parcial
- Pagamentos registrados em `financial_payments` para fechamento por forma de pagamento

## Segurança

- RLS em `sales`, `sale_items`, `financial_payments`
- `company_id` derivado no servidor (RPC SECURITY DEFINER + membership)
- Idempotência por `idempotency_key` na venda e nos pagamentos

## Migration

`supabase/migrations/20260818140000_point_of_sale.sql` (após migration de estoque)

## Limitações

- Sem NFC-e, SAT, TEF ou leitor físico
- Fechamento de caixa dedicado (UI) depende de branch futura; pagamentos já alimentam `financial_payments`
