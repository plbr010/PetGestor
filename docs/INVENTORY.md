# PetGestor — Estoque

Módulo operacional de produtos internos e vendáveis, **sem PDV**.

Migration: `supabase/migrations/20260818120000_inventory.sql` (**pendente de aplicação remota**)

## Modelo

```text
companies
  → product_categories
  → inventory_suppliers
  → products
       → product_batches
       → stock_movements (imutável)
  → service_product_recipes  (stub; sem baixa automática)
```

`company_id` é sempre derivado no servidor (`requireCompanyContext` / RPC `auth.uid()` + membership). RLS com `private.is_company_member`.

## Regras

- Saldo (`products.current_stock`) e custo médio (`cost_price_cents`) **só mudam** via RPC `register_stock_movement`.
- Trigger `protect_product_stock_columns` bloqueia UPDATE direto dessas colunas.
- Movimentações não podem ser atualizadas nem apagadas. Correção = nova movimentação (ajuste/inverso).
- Quantidades `numeric(14,3)` — unidade, kg, g, ml, litro, pacote, caixa, outro.
- Saldo negativo é bloqueado.
- Produto vencido (lote com `expiration_date < CURRENT_DATE`) **não entra** no disponível para saída comum; perda/vencimento pode baixar o físico.
- Custo médio ponderado nas entradas/devoluções com custo informado.
- Idempotência: `UNIQUE (company_id, idempotency_key)` + retorno do movimento existente.
- Concorrência: `SELECT … FOR UPDATE` no produto dentro da RPC.

## RPC

`register_stock_movement(...)` — SECURITY DEFINER, EXECUTE para `authenticated`.

Tipos: `entry`, `exit`, `adjustment`, `loss`, `internal_use`, `return`.

Ajuste informa `p_counted_stock` (contagem física). A diferença vira a quantidade do movimento.

Campos `reference_type` / `reference_id` existem para futura venda/OS — não usados nesta etapa.

## UI

`/dashboard/estoque` — produtos (cards no mobile, tabela no desktop)

`/dashboard/estoque/movimentacoes` — histórico global

`/dashboard/estoque/fornecedores` — cadastro simples

`/dashboard/estoque/categorias` — criar/editar/arquivar

## Fora desta etapa

PDV, NFC-e, leitor físico, compras automáticas, baixa automática por serviço, despesa financeira na entrada.
