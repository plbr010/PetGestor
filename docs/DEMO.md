# Conta demonstrativa — PetGestor

A conta demo popula o **Pet Shop Amigo Fiel** com dados fictícios cobrindo todos os módulos operacionais do PetGestor.

## Credenciais padrão

| Campo | Valor |
|-------|-------|
| E-mail | `mariana+demo@demo.petgestor.app` |
| Senha | `PetGestorDemo2026!` |
| Empresa | Pet Shop Amigo Fiel |
| Gestora | Mariana |

> Use apenas em desenvolvimento ou staging. A conta é identificada como demo em `src/config/demo-accounts.ts` e pode ser removida em `/admin`.

## Pré-requisitos

1. Projeto Supabase configurado com migrations aplicadas
2. `.env.local` com:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Executar o seed

### Opção A — SQL Editor (recomendado se não quiser rodar Node)

1. Abra o **SQL Editor** do Supabase
2. Cole o conteúdo de [`docs/sql/SEED-demo-account.sql`](sql/SEED-demo-account.sql)
3. Clique em **Run**
4. Entre em `/entrar` com as credenciais acima

Para recriar do zero (apaga a empresa demo e recria):

```sql
SELECT public.seed_demo_account(true);
```

Se as funções já existirem, basta executar a linha acima.

### Opção B — Script Node

```bash
npm run seed:demo
```

Opções:

- `--force` — executa o seed mesmo se já houver tutores cadastrados (pode duplicar dados; prefira limpar via `/admin` antes)

## O que é criado

| Módulo | Dados demonstrativos |
|--------|----------------------|
| Tutores & pets | Ana/Thor, Carlos/Luna, Juliana/Mel, Roberto/Bob, Fernanda/Nina |
| Serviços | Banho e tosa (por porte), consulta, hidratação, tosa higiênica |
| Equipe | Rafaela, Pedro, Camila — com horários e serviços vinculados |
| Pacotes | Pacote 4 Banhos vendido para Fernanda/Nina |
| Agenda | 5 agendamentos do dia + recorrência semanal do Thor |
| Lista de espera | Bob aguardando tosa |
| Bloqueios | Pausa de almoço da Rafaela |
| Atendimentos | Check-in, em andamento, pronto e concluído |
| Estoque | Categorias, fornecedores, produtos com movimentação de entrada |
| Receitas | Insumos do banho vinculados ao serviço |
| Financeiro | Receitas e despesas pagas e pendentes |
| PDV | Caixa aberto, venda concluída e venda parcialmente paga |
| Notificações | Configurações WhatsApp + alertas in-app |
| Onboarding | Tutorial marcado como concluído |
| Assinatura | Trial estendido por 1 ano |

## Limpeza

- Painel: `/admin` → **Limpeza de contas demo**
- SQL manual: `docs/sql/DELETE-demo-accounts.sql`

## Arquivos relacionados

- `src/config/demo-seed-data.ts` — dados fictícios
- `src/features/demo/seed-demo-account.ts` — lógica de seed
- `docs/sql/SEED-demo-account.sql` — seed via SQL Editor (sem Node)
- `src/config/demo-data.ts` — preview estático da landing (marketing)
