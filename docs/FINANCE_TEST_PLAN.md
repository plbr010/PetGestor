# PetGestor — Plano de testes: Financeiro

## Pré-requisitos

- Migrations anteriores aplicadas, incluindo `20260806080000_service_orders.sql`
- Migration financeiro aplicada: `20260806081500_finance.sql`
- Empresa A e Empresa B com usuários distintos

## Cenários críticos (automáticos + manuais)

### 1. Snapshot de preço

1. Agendar banho a R$ 60,00
2. Marcar atendimento como pronto
3. Verificar: exatamente 1 receita pending de R$ 60,00
4. Alterar preço do serviço para R$ 80,00
5. Receita antiga continua R$ 60,00

### 2. Pagamento

6. Registrar Pix na receita
7. Status → paid; dashboard soma R$ 60 recebido hoje/mês

### 3. Resultado realizado

8. Criar despesa R$ 20 paga
9. Resultado realizado = R$ 40
10. Criar receita manual pending e despesa pending
11. Pendentes **não** entram no realizado
12. Cancelado **não** entra em resultado

### 4. Idempotência

13. Clicar várias vezes em "Marcar como pronto" — não duplica receita

### 5. Entrega com pendência

14. Finalizar entrega com pagamento pending — confirmação exibida; entrega permitida

### 6. Isolamento (IDOR)

15. Empresa B não vê financeiro da Empresa A
16. `/dashboard/financeiro/UUID_EMPRESA_A` logado como B → 404

### 7. Cancelamento

17. Receita de atendimento: cancelamento bloqueado
18. Receita manual: cancelamento permitido

### 8. Reabertura

19. Marcar pago por engano → reabrir → pending; editar valor → marcar pago novamente

### 9. Filtros e busca

20. Filtrar por tipo, status, forma de pagamento
21. Buscar por descrição/categoria (`?q=`)
22. Paginação 20 por página

### 10. Período

23. Presets Hoje / Esta semana / Este mês
24. Default = mês atual (timezone da empresa)

## Testes automatizados (Vitest)

- `src/features/finance/status.test.ts` — transições, filtros, edição manual
- `src/features/finance/schemas.test.ts` — validação receita/despesa/pagamento
- `src/features/finance/utils.test.ts` — moeda, resumos realizado/projetado, período

RLS não é provada via mock — validar manualmente com duas empresas.

## Checklist pós-deploy

- [ ] Migration financeiro aplicada
- [ ] Atendimento pronto gera receita
- [ ] Pagamento na tela de atendimento
- [ ] Dashboard com valores reais
- [ ] Desktop / tablet / mobile
