# PetGestor — Produto

## Problema

Pet shops pequenos e médios costumam gerenciar agenda, clientes, pets, serviços e financeiro em planilhas, cadernos ou ferramentas genéricas. Isso gera retrabalho, falta de visão do negócio e dificuldade para crescer com segurança.

## Cliente

Donos e gestores de pet shops que precisam de uma solução simples, acessível e focada no dia a dia do setor pet.

## Escopo atual

- Site público (landing, cadastro, login) com preços e trial canônicos
- Autenticação real (Supabase Auth), onboarding e multiempresa com RLS
- Agenda, tutores, pets, serviços, equipe, atendimentos e pacotes
- Financeiro operacional, estoque, PDV e relatórios
- Trial de 7 dias sem cartão e assinatura Mercado Pago (mensal/anual)
- Painel interno `/admin` (não exposto na navegação pública)
- WhatsApp **transacional** (lembretes) no código; envio real depende da conta Meta. Ver `docs/WHATSAPP_SETUP.md`

A prévia da landing (`/#demonstracao`) é ilustrativa. Não existe dashboard público anônimo.

## Indexação pública (SEO)

Decisão explícita — não herdar `robots` do `RootLayout` por acaso:

| Rota | Indexável | Motivo |
|------|-----------|--------|
| `/` | Sim (`index, follow`) | Landing pública |
| `/cadastro` | Sim (`index, follow`) | Página de conversão do trial; permanece no sitemap |
| `/entrar` | Não (`noindex, follow`) | Login não é destino de busca; fora do sitemap. Sem `Disallow` no robots.txt para o crawler ler o noindex |
| Recuperar/nova senha, convite, onboarding, verifique-email, `/auth/*` | Não (`noindex, nofollow`) | Rotas técnicas / com token |

`metadataBase`, canonical e sitemap usam a política de `src/lib/env/resolve-app-url.ts`. Em production sem `APP_URL` / `NEXT_PUBLIC_APP_URL` / `VERCEL_URL` válido, não há fallback para localhost.

## Fora do escopo atual

- Chatbot, inteligência artificial, marketing e disparo em massa no WhatsApp
- Múltiplas empresas por usuário na interface
- Mudança de papéis pela interface (além dos fluxos já existentes de convite/equipe)

## Teste gratuito

PetGestor oferece **7 dias de teste gratuito** sem exigir meio de pagamento.

- Constantes: `TRIAL_DURATION_DAYS = 7`, `TRIAL_DURATION_HOURS = 168` em `src/config/subscription.ts`
- Início: criação da empresa (onboarding)
- Fim: `trial_ends_at = trial_started_at + 7 days` (PostgreSQL)
- Posicionamento: **“Teste grátis por 7 dias”** e **“Sem cartão”**
- Após expiração: acesso operacional suspenso até período pago vigente
- Cobrança Mercado Pago: checkout pós-trial via preapproval

Ver `docs/SUBSCRIPTIONS.md` e `docs/MERCADO_PAGO_SETUP.md`.
