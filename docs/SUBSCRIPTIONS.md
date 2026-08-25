# PetGestor — Assinaturas e trial

## Regra comercial

PetGestor oferece **7 dias de teste gratuito** sem exigir meio de pagamento.

Após `trial_ends_at`, se não houver assinatura `active`, o **acesso operacional é suspenso** até existir assinatura válida.

Não há cobrança automática ao fim do trial. Sem meio de pagamento cadastrado, simplesmente não há cobrança.

### Funcionários

- Funcionários **não pagam** assinatura.
- O acesso deles depende da assinatura (ou trial) **da empresa** em que trabalham.
- Sem entitlement da empresa, o staff vai para `/assinatura-equipe` (mensagem), **não** para o checkout.
- Só quem tem `subscription.manage` (dono/gestor) acessa `/assinatura` e Mercado Pago.

### Conta admin da plataforma

- Empresas com `companies.billing_exempt = true` têm assinatura **sempre ativa** (sem cobrança).
- Owners na allowlist / `platform_admins` têm a empresa marcada como isenta na migration.
- Platform admin também bypassa o gate no layout (já existente).

## Tabela `company_subscriptions`

| Campo | Descrição |
|-------|-----------|
| `company_id` | PK → `companies` |
| `plan_code` | `petgestor_monthly` (default) ou `petgestor_annual` |
| `billing_interval` | `monthly` \| `annual` (default `monthly`) |
| `offer_code` | Oferta comercial opcional (ex.: `annual_launch_799`) — sem countdown falso |
| `status` | `trialing`, `active`, `past_due`, `cancelled` |
| `trial_started_at` | Início do trial |
| `trial_ends_at` | Fim exato (+7 dias / 168 horas) |
| `provider` | `mercado_pago` quando integrado |
| `provider_subscription_id` | ID preapproval Mercado Pago |
| `provider_status` | Status real MP (`pending`, `authorized`, `paused`, `canceled`) |
| `provider_checkout_url` | `init_point` do checkout hospedado |
| `current_period_start` / `current_period_end` | Período pago (anual = +12 meses civis na 1ª ativação) |

Migration: `20260824200000_annual_subscription_plan.sql` (**aplicar no Supabase**).

## Planos

| Plano | Código | Intervalo | Preço (server-side) |
|-------|--------|-----------|---------------------|
| Mensal | `petgestor_monthly` | `monthly` | R$ 89,90 / mês |
| Anual | `petgestor_annual` | `annual` | R$ 799,00 / ano (`offer_code`: `annual_launch_799`) |

- Equivalente anual: R$ 66,58/mês; economia vs 12× mensal: R$ 279,80
- Frontend informa só `plan` (`monthly` \| `annual`); **preço nunca vem do browser**
- Clicar em Assinar **não** ativa — só webhook/sync com preapproval autorizado

## Mercado Pago (Etapa 10B)

- Modelo: **Subscriptions sem plano associado** — preapproval individual por empresa
- Checkout **somente após** trial expirado e clique em Assinar
- **Sem** `free_trial` no Mercado Pago (trial já ocorreu no PetGestor)
- **Sem** `card_token_id` — checkout hospedado MP
- `external_reference`: `petgestor_company_<uuid>`
- Mensal: `auto_recurring` frequency `1` month × R$ 89,90
- Anual: `auto_recurring` frequency `12` months × R$ 799,00 (renovação recorrente pelo MP)
- Sincronização via API + webhook — nunca confiar em query params do browser
- Webhooks idempotentes via `billing_webhook_events` (evento duplicado não recria período)
- Ver `docs/MERCADO_PAGO_SETUP.md`

### Trocas de plano (escopo atual)

- **Mensal ativo → anual:** permitido na área `/assinatura`. Cancela a renovação mensal no MP (acesso permanece até o fim do período mensal já pago), abre checkout anual de R$ 799; o anual **só ativa após pagamento**.
- **Anual ativo → mensal:** **bloqueado** enquanto o período anual já pago estiver vigente. O cliente cancela a renovação e, no fim do período, assina o mensal.
- Escolha mensal/anual também no checkout quando não há assinatura ativa (trial expirado, cancelado, past_due)

## Trial de 7 dias

- `trial_ends_at = trial_started_at + interval '7 days'` (168 horas)
- **Não** usa `CURRENT_DATE + 7` sem hora — o timestamp preserva a hora de início
- Exemplo: 25/08/2026 10:00 → 01/09/2026 10:00

Migration de duração: `20260825120000_trial_7_days.sql` (só novas empresas).
## Criação automática

Trigger `AFTER INSERT ON companies` → `private.create_company_subscription()` (idempotente).

Toda empresa nova recebe registro de trial. Nunca existe company sem subscription após migration.

## Backfill (desenvolvimento)

Empresas existentes sem registro recebem trial iniciando no momento da migration original.
Registros existentes **não** são sobrescritos.

## Entitlement (server-side)

Estados derivados:

| Estado | Acesso operacional |
|--------|-------------------|
| `trialing` (não expirado) | Sim |
| `trial_expired` | Não |
| `active` | Sim |
| `past_due` | Não (MVP) |
| `cancelled` | Não (sem período restante) |

Implementação: `src/features/subscription/entitlement.ts`

## Gate centralizado

1. **Dashboard layout** — sem entitlement: dono → `/assinatura`; funcionário → `/assinatura-equipe`
2. **`requireCompanyContext()`** — protege Server Actions e queries operacionais (mesmo split)

Rotas acessíveis sem entitlement:

- `/assinatura` (só quem gerencia cobrança)
- `/assinatura-equipe` (staff)
- `/entrar`, logout, onboarding (sem company ainda)

## Dados preservados

Expiração **não apaga** tutores, pets, agenda, financeiro ou empresa. Apenas suspende acesso.

## Configuração

`src/config/subscription.ts`:

- `TRIAL_DURATION_HOURS = 168`
- `TRIAL_DURATION_DAYS = 7`
- `PLAN_MONTHLY_PRICE_CENTS = 8990`
- `PLAN_ANNUAL_PRICE_CENTS = 79900`
- `PLAN_CODES.monthly` / `PLAN_CODES.annual`
- `ANNUAL_OFFER_CODE_LAUNCH = 'annual_launch_799'`

## Cancelamento

- CTA: **Cancelar renovação** (não “apagar acesso imediato”)
- Status `cancelled` + `current_period_end` no futuro → acesso operacional **mantido** até o fim do período já pago
- Sem política automática de reembolso

## Dev / teste

Documentado em `docs/TRIAL_TEST_PLAN.md`:

```sql
UPDATE public.company_subscriptions
SET trial_ends_at = now() - interval '1 minute'
WHERE company_id = '<uuid-da-empresa-teste>';
```

Opcional: `BILLING_DEV_BYPASS=true` (somente `NODE_ENV !== 'production'`).

## Não incluído

Stripe, cupons, semestral/trimestral/vitalício, NF, afiliados, outro gateway.

**Migrations relevantes:** trial + Mercado Pago billing + `20260824200000_annual_subscription_plan.sql`
