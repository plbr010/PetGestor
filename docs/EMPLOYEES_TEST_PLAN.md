# PetGestor — Plano de testes: Funcionários

## Pré-requisitos

1. Migration `20260806071500_employees.sql` aplicada
2. Pelo menos um serviço ativo cadastrado
3. Usuário autenticado com empresa configurada

---

## Testes funcionais

| # | Teste | Passos | Esperado |
|---|-------|--------|----------|
| 1 | Cadastrar funcionário | `/dashboard/funcionarios/novo` — preencher dados, serviços e horários | Funcionário criado |
| 2 | Editar | Alterar nome, cargo, telefone | Dados atualizados |
| 3 | Vincular serviço | Marcar serviços no formulário | Badges visíveis no detalhe |
| 4 | Remover serviço | Desmarcar serviço na edição | Serviço removido do perfil |
| 5 | Configurar horários | Seg–Sex 08:00–18:00, Sáb 08:00–13:00, Dom folga | Horários corretos no detalhe |
| 6 | Alterar horários | Mudar intervalo de um dia | Atualizado após salvar |
| 7 | Desativar | Detalhe → Desativar | Badge "Inativo" |
| 8 | Reativar | Detalhe → Ativar | Badge "Ativo" |
| 9 | Arquivar | Detalhe → Arquivar | Some da listagem |
| 10 | Busca | `?q=João` | Filtra por nome/cargo/telefone/email |
| 11 | Filtros | `?status=active`, `?schedulable=yes` | Lista correta |
| 12 | Paginação | 21+ funcionários, `?page=2` | Segunda página |
| 13 | Cross-tenant lista | Empresa B | Não vê funcionários da Empresa A |
| 14 | IDOR | Empresa B abre UUID da Empresa A | **404** |
| 15 | Serviço cross-tenant | Tentativa via SQL/API | FK + RLS bloqueiam |
| 16 | Horário cross-tenant | Tentativa via SQL/API | FK + RLS bloqueiam |

---

## Testes automatizados

```bash
npm run test
```

Arquivos: `schemas.test.ts`, `utils.test.ts`

---

## Registro de execução

| Data | Executor | Resultado | Observações |
|------|----------|-----------|-------------|
| _pendente_ | | | |
