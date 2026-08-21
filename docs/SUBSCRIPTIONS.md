# PetGestor — Assinaturas e trial

## Regra comercial

PetGestor oferece **72 horas de teste gratuito** sem exigir meio de pagamento.

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
| `plan_code` | Default `petgestor_monthly` |
| `status` | `trialing`, `active`, `past_due`, `cancelled` |
| `trial_started_at` | Início do trial |
| `trial_ends_at` | Fim exato (+72 horas) |
| `provider` | `mercado_pago` quando integrado |
| `provider_subscription_id` | ID preapproval Mercado Pago |
| `provider_status` | Status real MP (`pending`, `authorized`, `paused`, `canceled`) |
| `provider_checkout_url` | `init_point` do checkout hospedado |

## Mercado Pago (Etapa 10B)

- Modelo: **Subscriptions sem plano associado** — preapproval individual por empresa
- Checkout **somente após** trial expirado e clique em Assinar
- **Sem** `free_trial` no Mercado Pago (trial já ocorreu no PetGestor)
- **Sem** `card_token_id` — checkout hospedado MP
- `external_reference`: `petgestor_company_<uuid>`
- Sincronização via API + webhook — nunca confiar em query params do browser
- Ver `docs/MERCADO_PAGO_SETUP.md`

## Trial de 72 horas

- `trial_ends_at = trial_started_at + interval '72 hours'`
- **Não** usa `CURRENT_DATE + 3`
- Exemplo: terça 14:37 → sexta 14:37

## Criação automática

Trigger `AFTER INSERT ON companies` → `private.create_company_subscription()` (idempotente).

Toda empresa nova recebe registro de trial. Nunca existe company sem subscription após migration.

## Backfill (desenvolvimento)

Empresas existentes sem registro recebem trial iniciando no momento da migration (+72h).

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

- `TRIAL_DURATION_HOURS = 72`
- `PLAN_MONTHLY_PRICE_CENTS = 8990`
- `PLAN_CODE = 'petgestor_monthly'`

## Dev / teste

Documentado em `docs/TRIAL_TEST_PLAN.md`:

```sql
UPDATE public.company_subscriptions
SET trial_ends_at = now() - interval '1 minute'
WHERE company_id = '<uuid-da-empresa-teste>';
```

Opcional: `BILLING_DEV_BYPASS=true` (somente `NODE_ENV !== 'production'`).

## Não incluído

Outros gateways, NF, estoque.

**Migrations pendentes:** trial + `20260806084500_mercado_pago_billing.sql`
