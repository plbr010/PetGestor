# PetGestor — Configurar WhatsApp (Cloud API oficial da Meta)

Este guia é para você configurar o envio de **lembretes de agendamento** pelo WhatsApp oficial.

Não é WhatsApp Web, não é robô de vendas e não é disparo em massa. São só mensagens sobre um atendimento já marcado.

**Nunca cole Access Token, App Secret ou verify token no chat, no Cursor ou em prints públicos.** Coloque esses valores **direto** no `.env.local` (computador) ou na Vercel (produção).

Enquanto a conta Meta, os modelos e as credenciais não estiverem prontos:

> Código pronto; integração aguardando configuração da conta Meta/templates/credenciais.

---

## 1. Onde criar o app na Meta

1. Acesse [Meta for Developers](https://developers.facebook.com/)
2. Entre com a conta que vai gerenciar o WhatsApp Business
3. Vá em **Meus aplicativos** → **Criar aplicativo**
4. Escolha um app do tipo **Business**
5. No painel do app, adicione o produto **WhatsApp** (WhatsApp Business Platform / Cloud API)

Você também precisa de:

- uma **Conta do WhatsApp Business** (WABA)
- um **número de telefone** conectado a essa conta (pode ser o número de teste da Meta no começo)

---

## 2. Onde encontrar o Phone Number ID

1. No app da Meta, abra **WhatsApp → Configuração da API** (API Setup)
2. No bloco do número, copie **Phone number ID** (identificador do número, não é o telefone em si)

Esse valor vai na variável `WHATSAPP_PHONE_NUMBER_ID`.

---

## 3. Onde encontrar o WABA ID

Na mesma tela de **WhatsApp → Configuração da API**:

- copie **WhatsApp Business Account ID** (WABA ID)

Esse valor vai em `WHATSAPP_BUSINESS_ACCOUNT_ID` (referência; o envio usa o Phone Number ID).

---

## 4. Como gerar o token correto

1. Na mesma área de WhatsApp, use um **token de acesso** com permissão de envio
2. Em produção, prefira um **token permanente** do sistema (System User) no Business Manager, com permissão no WABA
3. Copie o token **uma vez** e cole **somente** em:
   - local: arquivo `.env.local`
   - produção: Vercel → Project → Settings → Environment Variables → `WHATSAPP_ACCESS_TOKEN`

Não prefixe com `NEXT_PUBLIC_`. Não cole no Git. Não cole no chat.

---

## 5. Como configurar o webhook

1. No app da Meta, abra **WhatsApp → Configuração** (ou Webhooks)
2. Clique para configurar webhook
3. Informe a URL (passo 6) e o verify token (passo 7)
4. Assine o campo **messages** (atualizações de status: enviada, entregue, lida, falhou)

O PetGestor **não** responde conversas. O webhook só atualiza o status da mensagem já enviada.

---

## 6. Qual URL colocar na Meta

Substitua pelo domínio HTTPS real do app na Vercel:

```text
https://SEU_DOMINIO/api/webhooks/whatsapp
```

Exemplo de formato (não use este domínio se não for o seu):

```text
https://www.seudominio.com/api/webhooks/whatsapp
```

Localhost **não** recebe webhook da Meta. Para testar o webhook de verdade, use o deploy na Vercel.

---

## 7. Qual verify token usar

Crie uma frase secreta **sua**, por exemplo uma senha longa gerada por você.

Coloque **o mesmo valor** em dois lugares:

1. Campo **Verify token** na tela de webhook da Meta
2. Variável `WHATSAPP_WEBHOOK_VERIFY_TOKEN` na Vercel / `.env.local`

Não precisa ser o Access Token. É só um código combinado para a Meta confirmar a URL.

Também configure `META_APP_SECRET` (segredo do app, em Configurações do aplicativo → Básico). Sem isso o PetGestor **recusa** atualizações de status.

---

## 8. Quais templates preciso criar

Na Meta, abra **WhatsApp Manager → Modelos de mensagem** (Message templates) e **crie** os modelos abaixo.

Eles **ainda não estão aprovados**. Você precisa cadastrar e esperar a análise da Meta.

Categoria sugerida para todos: **Utilidade** (UTILITY).  
Idioma sugerido: **Português (Brasil)** — código `pt_BR`.

Os nomes podem ser alterados depois, desde que você copie o nome aprovado para as variáveis `WHATSAPP_TEMPLATE_*`.

### 8.1 Tutor — lembrete do dia

- **Nome sugerido:** `petgestor_customer_same_day`
- **Categoria:** Utilidade
- **Idioma:** `pt_BR`
- **Texto:**

```text
Olá, {{1}}!
Passando para lembrar que {{2}} tem {{3}} agendado hoje às {{4}} na {{5}}.
```

| Variável | Significado | Exemplo |
|---|---|---|
| {{1}} | Nome do tutor | Maria |
| {{2}} | Nome do pet | Thor |
| {{3}} | Serviço | Banho |
| {{4}} | Hora | 15:00 |
| {{5}} | Nome do pet shop | PetGestor Shop |

Variável no servidor: `WHATSAPP_TEMPLATE_CUSTOMER_SAME_DAY` (se vazio, o código usa `petgestor_customer_same_day`).

### 8.2 Tutor — 2 horas antes

- **Nome sugerido:** `petgestor_customer_2h`
- **Categoria:** Utilidade
- **Idioma:** `pt_BR`
- **Texto:**

```text
Olá, {{1}}!
O atendimento de {{2}} começa daqui a 2 horas, às {{3}}.
```

| Variável | Significado | Exemplo |
|---|---|---|
| {{1}} | Nome do tutor | Maria |
| {{2}} | Nome do pet | Thor |
| {{3}} | Hora | 15:00 |

Variável: `WHATSAPP_TEMPLATE_CUSTOMER_2H` (padrão `petgestor_customer_2h`).

### 8.3 Pet pronto

- **Nome sugerido:** `petgestor_pet_ready`
- **Categoria:** Utilidade
- **Idioma:** `pt_BR`
- **Texto:**

```text
Olá, {{1}}!
{{2}} já está pronto(a) e pode ser buscado(a).
```

| Variável | Significado | Exemplo |
|---|---|---|
| {{1}} | Nome do tutor | Maria |
| {{2}} | Nome do pet | Thor |

Variável: `WHATSAPP_TEMPLATE_PET_READY` (padrão `petgestor_pet_ready`).

### 8.4 Funcionário — lembrete do dia

- **Nome sugerido:** `petgestor_employee_same_day`
- **Categoria:** Utilidade
- **Idioma:** `pt_BR`
- **Texto:**

```text
Olá, {{1}}!
Você tem atendimento de {{2}} hoje às {{3}}.
Serviço: {{4}}.
```

| Variável | Significado | Exemplo |
|---|---|---|
| {{1}} | Nome do funcionário | João |
| {{2}} | Nome do pet | Thor |
| {{3}} | Hora | 15:00 |
| {{4}} | Serviço | Banho |

Variável: `WHATSAPP_TEMPLATE_EMPLOYEE_SAME_DAY` (padrão `petgestor_employee_same_day`).

### 8.5 Funcionário — 2 horas antes

- **Nome sugerido:** `petgestor_employee_2h`
- **Categoria:** Utilidade
- **Idioma:** `pt_BR`
- **Texto:**

```text
Lembrete: atendimento de {{1}} em 2 horas, às {{2}}.
Serviço: {{3}}.
```

| Variável | Significado | Exemplo |
|---|---|---|
| {{1}} | Nome do pet | Thor |
| {{2}} | Hora | 15:00 |
| {{3}} | Serviço | Banho |

Variável: `WHATSAPP_TEMPLATE_EMPLOYEE_2H` (padrão `petgestor_employee_2h`).

### 8.6 Opcionais (já existem na fila interna)

Só crie se quiser enviar também confirmação e lembrete de 24h. Sem o nome na Vercel, esses tipos **não** são enviados.

**Confirmação** (`WHATSAPP_TEMPLATE_CONFIRMATION`):

```text
Olá, {{1}}! O agendamento de {{2}} está confirmado para {{3}} às {{4}}.
```

1 = tutor, 2 = pet, 3 = data, 4 = hora.

**Lembrete 24h** (`WHATSAPP_TEMPLATE_CUSTOMER_24H`):

```text
Olá, {{1}}! Passando para lembrar que {{2}} tem atendimento amanhã às {{3}}.
```

1 = tutor, 2 = pet, 3 = hora.

---

## 9. Quais variáveis colocar na Vercel

Vercel → seu projeto → **Settings → Environment Variables**.

Marque Production (e Preview, se quiser testar no deploy de teste).

### Obrigatórias para envio real

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET`
- `WHATSAPP_SEND_ENABLED` → use `false` até os templates estarem aprovados; depois `true`
- `CRON_SECRET` → senha longa; a Vercel envia esse valor no cron
- `SUPABASE_SERVICE_ROLE_KEY` → já usada no billing; o worker da fila também precisa

### Recomendadas

- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `META_GRAPH_API_VERSION` → se vazio, o app usa `v22.0`
- `WHATSAPP_TEMPLATE_LANGUAGE` → se vazio, usa `pt_BR`
- `WHATSAPP_TEST_RECIPIENT` → seu número de teste no formato internacional, ex. `+5532999999999`

### Nomes dos templates (opcional se você usou os nomes sugeridos)

- `WHATSAPP_TEMPLATE_CUSTOMER_SAME_DAY`
- `WHATSAPP_TEMPLATE_CUSTOMER_2H`
- `WHATSAPP_TEMPLATE_PET_READY`
- `WHATSAPP_TEMPLATE_EMPLOYEE_SAME_DAY`
- `WHATSAPP_TEMPLATE_EMPLOYEE_2H`
- `WHATSAPP_TEMPLATE_CONFIRMATION`
- `WHATSAPP_TEMPLATE_CUSTOMER_24H`

Depois de salvar, faça **Redeploy** do projeto.

---

## 10. Como testar (sem mandar para clientes)

1. Deixe `WHATSAPP_SEND_ENABLED=false`
2. Aplique a migration `supabase/migrations/20260817200000_whatsapp_notification_delivery.sql` no SQL Editor do Supabase
3. Crie um agendamento de teste no PetGestor
4. Em **Configurações**, confira o histórico: deve aparecer **Simulação (não enviada)** quando o cron rodar — **não** aparece como Entregue
5. Quando os templates estiverem aprovados:
   - configure `WHATSAPP_TEST_RECIPIENT` com **o seu** número
   - entre em `/admin` (conta de dono da plataforma)
   - use **Teste WhatsApp** — só aceita esse número autorizado

O cron roda sozinho na Vercel a cada 5 minutos (`vercel.json`). No plano gratuito da Vercel o cron pode ser menos frequente; aí os lembretes de 2 horas atrasam. O plano com cron de poucos minutos é o adequado.

Para disparar o worker manualmente (só você, com o segredo):

```text
Authorization: Bearer SEU_CRON_SECRET
GET ou POST https://SEU_DOMINIO/api/cron/whatsapp-notifications
```

---

## 11. Como ativar produção

Checklist:

1. Migration aplicada no Supabase
2. Templates **aprovados** na Meta, com os nomes iguais aos da Vercel
3. Webhook da Meta apontando para `https://SEU_DOMINIO/api/webhooks/whatsapp` e campo **messages** assinado
4. Variáveis da seção 9 preenchidas na Vercel (Production)
5. `WHATSAPP_SEND_ENABLED=true`
6. Redeploy
7. Teste no `/admin` com o número autorizado
8. Só então ative as automações em **Configurações** do pet shop

Se algo falhar, o histórico mostra **Falhou** com um texto simples (telefone inválido, modelo não configurado, etc.). Não inventamos status “Lida” sem confirmação da Meta.

---

## O que o PetGestor já faz sozinho

- Monta a fila quando o agendamento é criado/alterado
- Respeita os interruptores de cada pet shop
- Cancela lembretes se o agendamento for cancelado ou marcado como falta
- Não envia lembrete de 2h depois que o atendimento já começou
- Não envia se o telefone for inválido (não inventa DDD)
- Trava o registro no banco para não mandar a mesma mensagem duas vezes
- Atualiza Entregue / Lida / Falhou pelo webhook

## O que ainda impede mensagem real

- Conta Meta / WABA / número não configurados
- Access Token ausente ou sem permissão
- Templates não criados ou não aprovados
- `WHATSAPP_SEND_ENABLED` diferente de `true`
- Migration ainda não aplicada no Supabase
- Webhook/verify token/`META_APP_SECRET` ausentes (status de entrega não atualiza)
