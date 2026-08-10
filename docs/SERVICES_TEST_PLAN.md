# PetGestor — Plano de testes: Serviços

## Pré-requisitos

1. Migration `20260805210000_services.sql` aplicada no Supabase
2. Usuário autenticado com empresa configurada

---

## Testes funcionais

| # | Teste | Passos | Esperado |
|---|-------|--------|----------|
| 1 | Criar preço fixo | `/dashboard/servicos/novo` → Nome "Corte de unha", Fixed, R$ 20,00, 20 min | Serviço criado, detalhes corretos |
| 2 | Criar preço por porte | Novo → "Banho", by_size, preencher 4 portes | 4 faixas visíveis no detalhe |
| 3 | Editar fixed | Editar serviço fixed, alterar preço/duração | Valores atualizados |
| 4 | Editar by_size | Editar faixas de porte | Tabela atualizada |
| 5 | Fixed → by_size | Editar serviço fixed, mudar para por porte | Faixas criadas; preço fixo não usado |
| 6 | By_size → fixed | Editar serviço by_size, mudar para fixo | Faixas removidas; preço fixo exibido |
| 7 | Desativar | Detalhe → Desativar | Badge "Inativo"; some de ativos |
| 8 | Reativar | Detalhe → Ativar | Badge "Ativo" |
| 9 | Arquivar | Detalhe → Arquivar | Some da listagem |
| 10 | Busca | `?q=banho` | Filtra por nome/descrição |
| 11 | Filtro | `?status=active` / `inactive` | Lista correta |
| 12 | Paginação | Cadastrar 21+ serviços, `?page=2` | Segunda página |
| 13 | Cross-tenant | Empresa B abre UUID de serviço da Empresa A | **404** |
| 14 | Valores monetários | R$ 89,90 no form | Exibe R$ 89,90 no detalhe |
| 15 | Durações | 30–90 min by_size | Intervalo correto na lista |

---

## Testes de segurança (conceituais)

- UPDATE cross-company bloqueado (RLS + `.eq("company_id")`)
- Empresa B não lê preços/faixas da Empresa A
- FK composta impede faixa em serviço de outra empresa

---

## Testes automatizados (local)

```bash
npm run test
```

Cobertura: `src/lib/money.test.ts`, `src/features/services/schemas.test.ts`, `src/features/services/utils.test.ts`

---

## Registro de execução

| Data | Executor | Resultado | Observações |
|------|----------|-----------|-------------|
| _pendente_ | | | |
