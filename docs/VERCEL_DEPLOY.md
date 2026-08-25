# PetGestor — Deploy na Vercel

Guia das variáveis de ambiente e do que é necessário no build vs runtime.

## Pré-requisitos

1. Repositório conectado à Vercel (GitHub: `plbr010/PetGestor`)
2. Framework Preset: **Next.js**
3. Build Command: `npm run build` (padrão)
4. Install Command: `npm install` (padrão)
5. Node.js: 20.x ou superior (recomendado)

## Variáveis no painel Vercel

Configure em **Project → Settings → Environment Variables**.

Legenda:

- **Build**: necessária durante `next build` (valores `NEXT_PUBLIC_*` são embutidos no bundle)
- **Runtime**: necessária quando a rota/action correspondente é chamada
- **Pública**: segura no browser (`NEXT_PUBLIC_*`)
- **Server-only**: nunca prefixar com `NEXT_PUBLIC_`

### Production / Preview / Development

| Variável | Pública? | Build | Runtime | Production | Preview | Development |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | **Sim** | Sim | Obrigatória | Obrigatória | Obrigatória |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sim | **Sim** | Sim | Obrigatória | Obrigatória | Obrigatória |
| `APP_URL` | Não | Não | Sim (billing/auth redirects) | Obrigatória (URL HTTPS da Vercel) | Recomendada (URL do deploy Preview) | Opcional (`http://localhost:3000`) |
| `NEXT_PUBLIC_APP_URL` | Sim | Não* | Fallback de `APP_URL` | Opcional se `APP_URL` estiver setada | Opcional | Opcional |
| `SUPABASE_SERVICE_ROLE_KEY` | **Não** | Não | Sim (webhook / sync admin / convite de funcionário) | Obrigatória (billing + e-mail de convite) | Obrigatória para testar billing/convite | Obrigatória para testar billing/convite |
| `MERCADO_PAGO_ACCESS_TOKEN` | **Não** | Não | Sim (checkout/sync) | Obrigatória para cobrança | Obrigatória em sandbox | Obrigatória em sandbox |
| `MERCADO_PAGO_WEBHOOK_SECRET` | **Não** | Não | Sim (só `/api/webhooks/mercado-pago`) | Obrigatória para webhooks | Obrigatória para webhooks | Obrigatória para webhooks |
| `MERCADO_PAGO_ENVIRONMENT` | **Não** | Não | Sim | `production` | `test` | `test` |
| `MERCADO_PAGO_TEST_PAYER_EMAIL` | **Não** | Não | Sim (só ambiente `test`) | Não usar | Recomendada em `test` | Recomendada em `test` |
| `BILLING_DEV_BYPASS` | **Não** | Não | Dev only | **Nunca** `true` | Não | Opcional (`false` por padrão) |
| `CRON_SECRET` | **Não** | Não | Sim (cron WhatsApp) | Obrigatória para o cron | Obrigatória para testar cron | Obrigatória para testar cron |
| `WHATSAPP_ACCESS_TOKEN` | **Não** | Não | Sim (envio) | Obrigatória para envio real | Opcional | Opcional |
| `WHATSAPP_PHONE_NUMBER_ID` | **Não** | Não | Sim (envio) | Obrigatória para envio real | Opcional | Opcional |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | **Não** | Não | Referência | Recomendada | Opcional | Opcional |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | **Não** | Não | Sim (webhook GET) | Obrigatória para webhook | Obrigatória para webhook | Obrigatória para webhook |
| `META_APP_SECRET` | **Não** | Não | Sim (webhook POST) | Obrigatória para webhook | Obrigatória para webhook | Obrigatória para webhook |
| `META_GRAPH_API_VERSION` | **Não** | Não | Sim | Opcional (`v22.0`) | Opcional | Opcional |
| `WHATSAPP_SEND_ENABLED` | **Não** | Não | Sim | `true` só com templates aprovados | `false` | `false` |

\* `NEXT_PUBLIC_APP_URL` é lida em runtime; preferir `APP_URL` no servidor.

### `APP_URL` em produção

Use a URL HTTPS real do projeto, por exemplo:

```env
APP_URL=https://petgestor-xxx.vercel.app
```

Ou o domínio customizado:

```env
APP_URL=https://seudominio.com
```

**Não** use `http://localhost:3000` nem túneis (`loca.lt`, etc.) em Production.

Produção atual:

```env
APP_URL=https://pet-gestor-sepia.vercel.app
```

### Supabase → Authentication → URL Configuration

No painel do projeto Supabase (Production):

| Campo | Valor |
|---|---|
| **Site URL** | `https://pet-gestor-sepia.vercel.app` |
| **Redirect URLs** | incluir pelo menos: `https://pet-gestor-sepia.vercel.app/**` (ou as rotas `/auth/confirm**`, `/auth/callback**`, `/convite`) |

Sem Site URL / Redirect URLs corretos, o Supabase pode reescrever links de e-mail para o valor antigo (ex.: `http://localhost:3000`), mesmo com `redirectTo` certo no app.

### O que NÃO é necessário no build

Estas secrets **não** precisam existir para o `next build` concluir. Continuam obrigatórias no **runtime** das features que as usam:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `MERCADO_PAGO_TEST_PAYER_EMAIL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL` (fallback local só em desenvolvimento)
- Variáveis WhatsApp (`WHATSAPP_*`, `META_*`, `CRON_SECRET`)

Validação é **lazy**: o throw acontece ao chamar checkout, webhook ou sync — não ao importar o módulo durante o build de landing/login.

### O que É necessário no build

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Sem elas o app não autentica em runtime. Configure-as na Vercel **antes** do deploy.

## Webhook Mercado Pago (após o primeiro deploy)

URL de produção:

```text
https://SEU_DOMINIO/api/webhooks/mercado-pago
```

Eventos: `subscription_preapproval`, `subscription_authorized_payment`, `payment`.

Detalhes: `docs/MERCADO_PAGO_SETUP.md`.

## Checklist pós-deploy

1. Variáveis Production preenchidas (tabela acima)
2. Redeploy após salvar env vars
3. Abrir a landing `/` e `/entrar`
4. Confirmar login Supabase
5. Configurar webhook MP apontando para a URL HTTPS da Vercel
6. Testar `/assinatura` e retorno `/assinatura/retorno`

## Segurança

- Nunca commitar `.env.local`, `.env` ou `.env.production.local`
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY`, tokens Mercado Pago ou `WHATSAPP_ACCESS_TOKEN` no client
- `.env.example` contém apenas nomes/placeholders

Guia WhatsApp: `docs/WHATSAPP_SETUP.md`. Cron: `vercel.json` chama `/api/cron/whatsapp-notifications` a cada 5 minutos (plano Vercel com cron frequente).
