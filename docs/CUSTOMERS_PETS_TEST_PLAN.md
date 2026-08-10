# PetGestor — Plano de testes: Tutores e Pets

> Migration `20260805204500_customers_pets.sql` precisa estar aplicada antes dos testes remotos.

## Cenários manuais

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 1 | Criar tutor | Redireciona para detalhes do tutor |
| 2 | Editar tutor | Dados atualizados, mensagem de sucesso |
| 3 | Criar pet | Vinculado ao tutor, redireciona para detalhes |
| 4 | Editar pet | Dados atualizados |
| 5 | Página do tutor | Lista pets vinculados |
| 6 | Buscar tutor (`?q=`) | Filtra por nome/telefone/e-mail |
| 7 | Buscar pet (`?q=`) | Filtra por nome/raça |
| 8 | Paginação | 20 por página, navegação funciona |
| 9 | Arquivar pet | Some da listagem ativa |
| 10 | Arquivar tutor com pets ativos | Bloqueado com mensagem clara |
| 11 | Acessar tutor de outra empresa (UUID) | 404 |
| 12 | Acessar pet de outra empresa (UUID) | 404 |
| 13 | Criar pet com tutor de outra empresa | Erro no servidor / FK |

## Isolamento multiempresa

Repetir cenários 11–13 com duas contas em empresas diferentes.

## Registro

| Data | Executor | Resultado |
|------|----------|-----------|
| _pendente_ | | |
