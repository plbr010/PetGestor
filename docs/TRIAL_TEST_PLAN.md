# PetGestor — Plano de testes: Trial 7 dias

## Objetivo

Validar trial de **7 dias completos (168 horas)** sem cartão e bloqueio pós-expiração.

## Checklist nova empresa

1. Cadastro / onboarding cria `company_subscriptions`
2. `status = trialing`
3. `trial_started_at` ≈ agora
4. `trial_ends_at - trial_started_at` = **exatamente 168 horas** (7 dias)
5. Dashboard liberado durante o trial
6. Checkout Mercado Pago **bloqueado** enquanto trial ativo
7. Textos de UI/landing: “Teste grátis por 7 dias” (sem “72h” / “3 dias”)

## Simular expiração

```sql
UPDATE public.company_subscriptions
SET trial_ends_at = now() - interval '1 minute'
WHERE company_id = '<uuid-da-empresa-teste>';
```

Esperado: acesso operacional bloqueado; rota de assinatura disponível para dono/gestor.

## Restaurar trial (só teste)

```sql
UPDATE public.company_subscriptions
SET
  status = 'trialing',
  trial_started_at = now(),
  trial_ends_at = now() + interval '7 days'
WHERE company_id = '<uuid-da-empresa-teste>';
```

## Migration

Aplicar `docs/sql/APPLY-trial-7-days.sql` (ou `20260825120000_trial_7_days.sql`).

**Nota:** trials já existentes **não** são estendidos automaticamente.

## Checklist

- [ ] Trial 7 dias em nova empresa
- [ ] Contador usa `trial_ends_at` real
- [ ] Expiração bloqueia acesso sem apagar dados
- [ ] Assinar mensal/anual após trial (sem segundo trial)
- [ ] Usuário que já usou trial não ganha trial novo ao recriar fluxo existente
