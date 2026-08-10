# PetGestor — Plano de testes RLS

> **Status:** RLS definido nas migrations. Validar no banco remoto após aplicar todas as migrations (incl. `20260805204500_customers_pets.sql`).

Este plano prova isolamento multi-tenant no PostgreSQL — não apenas na interface.

## Pré-requisitos

1. Migrations aplicadas:
   - `20260805201500_auth_multi_tenant.sql`
   - `20260805203000_fix_onboarding_rls.sql`
   - `20260805204500_customers_pets.sql`
2. Dois usuários de teste (A e B) com onboarding em empresas diferentes
3. Script SQL: `docs/RLS_AUDIT.sql`

## Cenário

| Empresa | Usuário | Papel |
|---------|---------|-------|
| Empresa A | Usuário A | owner |
| Empresa B | Usuário B | owner |

---

## Parte A — Teste manual no browser (prova end-to-end)

### 1. Criar Empresa B

1. Abra janela anônima ou outro navegador
2. Vá em `/cadastro`
3. Cadastre com **e-mail diferente** do Usuário A
4. Nome: qualquer | Empresa: ex. “Empresa B Teste”
5. Confirme e-mail → faça login → conclua onboarding se necessário
6. (Dev) Acesse `http://localhost:3000/api/dev/security-context` — confirme `companyId` diferente da Empresa A

### 2. Dados na Empresa A

Logado como Usuário A:

| Item | Nome | Onde copiar UUID |
|------|------|------------------|
| Tutor | Teste Empresa A | URL `/dashboard/tutores/<UUID>` |
| Pet | Rex Empresa A | URL `/dashboard/pets/<UUID>` |

### 3. Tentativas cross-tenant (Usuário B)

Logado como Usuário B, abra diretamente:

```
/dashboard/tutores/<UUID_TUTOR_A>
/dashboard/pets/<UUID_PET_A>
/dashboard/tutores/<UUID_TUTOR_A>/editar
/dashboard/pets/<UUID_PET_A>/editar
```

**Resultado obrigatório:** página 404 (Not Found).  
**Proibido:** 403, mensagem “outra empresa”, ou qualquer dado da Empresa A.

### 4. Busca e listagem (Usuário B)

- `/dashboard/tutores?q=Teste Empresa A` → vazio
- `/dashboard/pets?q=Rex Empresa A` → vazio
- Dashboard: contagens não incluem dados da Empresa A

---

## Parte B — Auth / companies (Etapas 1–3)

### Via aplicativo

Com sessão do Usuário A:

1. **SELECT companies** — apenas Empresa A
2. Consultar `company_id` da Empresa B via app — vazio
3. **UPDATE companies** Empresa A (owner) — OK
4. **UPDATE companies** Empresa B — falha (0 rows)
5. **SELECT company_members** — apenas Empresa A
6. **INSERT company_members** via browser — negado
7. **SELECT profiles** — apenas próprio perfil

Repita com Usuário B na direção oposta.

---

## Parte C — customers / pets (Etapa 4)

| Teste | Usuário B tenta… | Esperado |
|-------|------------------|----------|
| SELECT tutor A | UUID na URL | 404 |
| SELECT pet A | UUID na URL | 404 |
| UPDATE tutor A | Server Action forjada | erro genérico / 0 rows |
| ARCHIVE pet A | botão com UUID A | erro genérico |
| INSERT pet com customer A | formulário | “Selecione um tutor válido” / FK error |
| COUNT global | dashboard B | só dados B |

---

## Parte D — SQL Editor (`docs/RLS_AUDIT.sql`)

1. Substitua placeholders por UUIDs reais
2. Execute o script completo
3. Confirme `ROLLBACK` no final
4. Leia avisos sobre limitação de `auth.uid()` no SQL Editor

**Limitação:** simulação JWT no SQL Editor não é 100% idêntica à API autenticada. Testes de browser (Parte A) são a prova definitiva de IDOR.

---

## Testes de onboarding

1. `complete_onboarding` duas vezes — segunda retorna empresa existente
2. Sem autenticação — falha

## Testes negativos (Data API)

| Ação | Resultado esperado |
|------|-------------------|
| INSERT direto em `companies` | Negado |
| INSERT direto em `company_members` | Negado |
| DELETE em `companies` | Negado |
| SELECT all profiles | Negado (exceto próprio) |
| UPDATE `company_id` em customer/pet | Trigger `22023` |
| pet B → customer A | FK violation |

## Critério de aceite

Multi-tenancy validado quando **Parte A + Parte C** passarem no browser e **Parte D** não reportar falhas (com ressalva documentada da simulação JWT).

## Registro de execução

| Data | Executor | Parte A | Parte C | Parte D | Observações |
|------|----------|---------|---------|---------|-------------|
| _pendente_ | | | | | |
