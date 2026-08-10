# PetGestor — Roadmap

## Concluído

1. **Fundação** — Next.js, UI, landing, dashboard demonstrativo
2. **Integração Supabase** — clientes browser/server, env validation
3. **Autenticação e multi-tenant** — cadastro, login, sessão SSR, RLS, onboarding
4. **Tutores e pets** — CRUD multiempresa (`customers`, `pets`)
5. **Serviços** — catálogo, preços fixos e por porte (`services`, `service_size_prices`)
6. **Funcionários** — equipe operacional, serviços executados e horários (`employees`)
7. **Agenda** — agendamentos, calendário dia/semana, conflitos, snapshots (`appointments`)
8. **Atendimentos / ordens de serviço** — check-in, fila operacional, entrega (`service_orders`)
9. **Financeiro operacional** — receitas/despesas, contas a receber, dashboard real (`financial_entries`)
10. **Trial 72h e controle de acesso** — `company_subscriptions`, entitlement, bloqueio pós-trial
11. **Mercado Pago e assinatura real** — checkout pós-trial, webhooks, recorrência MP

## Próximas fases

12. **Segurança, deploy e monitoramento** — produção, SMTP, rate limit, observabilidade

## Futuro multi-tenant

- Convites de funcionários
- Múltiplas empresas por usuário na UI
- Mudança de papéis pela interface
