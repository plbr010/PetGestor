# PetGestor — Plano de testes: Trial 72h

## Pré-requisitos

- Migration `20260806083000_subscriptions_trial.sql` aplicada
- Empresa A e Empresa B com usuários distintos

## Cenários

### Cadastro e trial

1. Novo cadastro **sem cartão**, Pix ou checkout
2. Confirmar e-mail e concluir onboarding
3. Verificar `company_subscriptions` criada automaticamente
4. `trial_ends_at - trial_started_at` = **exatamente 72 horas**
5. Dashboard operacional funciona durante trial
6. Banner de trial visível no dashboard

### Durante trial

7. Criar tutor, pet, agendamento — permitido
8. Financeiro e atendimentos — permitidos

### Expiração

9. Simular expiração (SQL abaixo)
10. Dashboard operacional bloqueado → redirect `/assinatura`
11. `/assinatura` acessível com informações do trial
12. Login continua funcionando; após login → `/assinatura` (via redirect do dashboard)
13. Dados **não** apagados (tutores/pets/agenda permanecem no banco)
14. Server Action direta (ex.: criar tutor) → bloqueada via `requireCompanyContext()`
15. Empresa B não vê subscription da Empresa A (RLS)
16. Nenhuma cobrança criada
17. Nenhum cartão solicitado em cadastro/onboarding/trial/dashboard

### Recuperação em dev

18. Restaurar trial válido:

```sql
UPDATE public.company_subscriptions
SET
  status = 'trialing',
  trial_started_at = now(),
  trial_ends_at = now() + interval '72 hours'
WHERE company_id = '<uuid>';
```

→ Acesso operacional retorna; dados intactos.

## Simular trial expirado

```sql
UPDATE public.company_subscriptions
SET trial_ends_at = now() - interval '1 minute'
WHERE company_id = '<uuid-da-empresa-teste>';
```

Aguarde alguns segundos e navegue no dashboard — próxima requisição deve redirecionar.

## Bypass DEV (opcional)

`.env.local`:

```env
BILLING_DEV_BYPASS=true
```

Somente em development. Ignorado em `NODE_ENV=production`.

## Testes automatizados

- `src/features/subscription/entitlement.test.ts`
- `src/features/subscription/utils.test.ts`
- `src/config/subscription.test.ts`

RLS: validar manualmente com duas empresas.

## Checklist

- [ ] Migration aplicada
- [ ] Trial 72h em nova empresa
- [ ] Banner durante trial
- [ ] Expiração bloqueia dashboard
- [ ] `/assinatura` funciona
- [ ] Server Action bloqueada
- [ ] Sem formulário de pagamento no onboarding
- [ ] Botão assinar desabilitado (Mercado Pago na 10B)
