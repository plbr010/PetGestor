# PetGestor — Plano de testes Mercado Pago

## Pré-requisitos

- Migration trial aplicada
- Migration `20260806084500_mercado_pago_billing.sql` aplicada
- `.env.local` com tokens (não commitar)
- URL pública para webhook (ou teste manual via refresh)

## Cenários

1. Cadastro novo sem Mercado Pago
2. Confirmar nenhuma chamada MP durante trial
3. Antes do fim do trial → dashboard funciona, checkout bloqueado
4. Tentativa direta de checkout → “Seu período de teste gratuito ainda está ativo.”
5. Expirar trial (SQL)
6. `/assinatura` acessível
7. Clicar **Assinar por R$ 89,90/mês**
8. Preapproval criada com `status=pending`
9. `external_reference=petgestor_company_<uuid>`
10. Redirect para domínio Mercado Pago (`init_point`)
11. Concluir checkout de teste no MP
12. Retorno `/assinatura/retorno`
13. Página consulta `GET /preapproval/{id}` — não confia em query params
14. Provider `authorized` → local `active`
15. Dashboard liberado
16. Dados anteriores preservados
17. Webhook `subscription_preapproval`
18. Webhook `subscription_authorized_payment`
19. Webhook `payment`
20. Webhook duplicado → sem efeito duplicado (`billing_webhook_events`)
21. Assinatura inválida → 401
22. Pagamento aprovado → `last_payment_status`
23. Pagamento rejeitado → `past_due` (conservador)
24. Regularização via MP
25. Cancelamento via ação
26. Nova assinatura após cancelamento
27. Empresa A nunca altera B
28. PetGestor não coleta cartão
29. Nenhuma cobrança antes do fim do trial
30. Refresh manual sincroniza

## Simular trial expirado

```sql
UPDATE public.company_subscriptions
SET trial_ends_at = now() - interval '1 minute'
WHERE company_id = '<uuid>';
```

## Simular webhook localmente

Use painel Mercado Pago → Webhooks → Simular notificação, ou aguarde evento real com URL pública.

## Refresh manual

Na tela `/assinatura`, botão **Atualizar status da assinatura**.
