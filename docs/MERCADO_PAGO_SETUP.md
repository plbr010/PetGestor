# PetGestor — Configuração Mercado Pago

Este guia é para o dono do pet shop configurar a assinatura **sem expor credenciais no chat ou no código**.

## 1. Criar aplicação

1. Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers)
2. Entre com sua conta Mercado Pago
3. Crie ou selecione uma **aplicação**
4. Use credenciais de **TESTE** primeiro

## 2. Obter Access Token (TESTE)

1. Na aplicação, abra **Credenciais de teste**
2. Copie o **Access Token de teste**
3. **Não cole o token em chats, prints públicos ou commits**

Adicione manualmente ao `.env.local`:

```env
MERCADO_PAGO_ACCESS_TOKEN=SEU_TOKEN_DE_TESTE
MERCADO_PAGO_ENVIRONMENT=test
MERCADO_PAGO_TEST_PAYER_EMAIL=EMAIL_DO_COMPRADOR_DE_TESTE
APP_URL=http://localhost:3000
```

### Payer de teste (obrigatório para checkout local)

No ambiente **test**, o Mercado Pago exige que **comprador (payer) e vendedor (collector)** sejam usuários diferentes. Se o e-mail autenticado no PetGestor for o mesmo da conta vendedora das credenciais, o checkout falha com *"Payer and collector cannot be the same user"*.

1. No [Mercado Pago Developers](https://www.mercadopago.com.br/developers), abra **Contas de teste**
2. Copie o e-mail da conta **Comprador** (não use o e-mail da conta **Vendedor** / collector)
3. Adicione ao `.env.local`:

```env
MERCADO_PAGO_TEST_PAYER_EMAIL=EMAIL_DO_COMPRADOR_DE_TESTE
```

Em **produção** (`MERCADO_PAGO_ENVIRONMENT=production`), essa variável é **ignorada** — o `payer_email` enviado ao Mercado Pago é sempre o e-mail real do assinante autenticado no PetGestor.

## 3. Configurar webhook

1. Na aplicação, vá em **Webhooks > Configurar notificações**
2. URL de teste (precisa ser pública — localhost não recebe webhook externo):
   `https://SEU_DOMINIO_PUBLICO/api/webhooks/mercado-pago`
3. Marque os eventos:
   - **Plans and Subscriptions → subscription_preapproval**
   - **Plans and Subscriptions → subscription_authorized_payment**
   - **Payments → payment**
4. Revele/copie o **Webhook Secret**
5. Adicione ao `.env.local`:

```env
MERCADO_PAGO_WEBHOOK_SECRET=SEU_SECRET
```

## 4. Service role Supabase (somente backend)

O webhook precisa atualizar assinatura sem sessão do usuário.

1. Supabase Dashboard → Project Settings → API
2. Copie **service_role** (secret)
3. Adicione ao `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE
```

**Nunca** prefixe com `NEXT_PUBLIC_`.

## 5. Aplicar migrations

No SQL Editor do Supabase, nesta ordem:

1. Trial + billing base (se ainda não aplicadas)
2. **Plano anual (obrigatório para mudar para R$ 799):**  
   `docs/sql/APPLY-annual-subscription-plan.sql`  
   (ou `supabase/migrations/20260824200000_annual_subscription_plan.sql`)

Sem essa migration, trocar para o anual / gravar `billing_interval` pode falhar no checkout.

## 6. Testar fluxo

1. Cadastre conta → 72h de trial (sem cartão)
2. Simule trial expirado (ver `docs/MERCADO_PAGO_TEST_PLAN.md`)
3. Acesse `/assinatura` → **Assinar por R$ 89,90/mês**
4. Conclua checkout no Mercado Pago (cartões de teste)
5. Retorno em `/assinatura/retorno` consulta API real
6. Dashboard liberado quando status = **authorized**

## 7. Produção (futuro)

1. Troque credenciais de **produção**
2. Atualize `APP_URL` para domínio real
3. Configure webhook em **modo produção**
4. `MERCADO_PAGO_ENVIRONMENT=production`
5. Remova ou deixe vazio `MERCADO_PAGO_TEST_PAYER_EMAIL` — produção usa sempre o e-mail real do assinante

Nunca misture token de teste com produção.
