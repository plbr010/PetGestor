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
10. **Trial 7 dias e controle de acesso** — `company_subscriptions`, entitlement, bloqueio pós-trial
11. **Mercado Pago e assinatura real** — checkout pós-trial, webhooks, recorrência MP
12. **Lembretes transacionais no WhatsApp** — fila existente + Cloud API oficial da Meta (aguardando conta/templates/credenciais)
13. **Estoque** — produtos, categorias, fornecedores, lotes, validade, custo médio e movimentações (`register_stock_movement`)
14. **PDV** — venda de produtos no balcão, caixa e baixa de estoque
15. **Relatórios e pacotes** — relatórios operacionais e pacotes de serviços
16. **Landing, conversão, acessibilidade e security headers** — BLOCO 10 (CSP completa ainda não)

## Próximas fases

17. **Deploy e monitoramento** — SMTP próprio, observabilidade, CSP completa testada em produção

## Futuro multi-tenant

- Múltiplas empresas por usuário na UI
- Mudança de papéis pela interface
