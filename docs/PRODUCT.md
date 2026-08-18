# PetGestor — Produto

## Problema

Pet shops pequenos e médios costumam gerenciar agenda, clientes, pets, serviços e financeiro em planilhas, cadernos ou ferramentas genéricas. Isso gera retrabalho, falta de visão do negócio e dificuldade para crescer com segurança.

## Cliente

Donos e gestores de pet shops que precisam de uma solução simples, acessível e focada no dia a dia do setor pet.

## Escopo inicial (fundação atual)

- Site público com apresentação do produto
- Páginas provisórias de entrada e cadastro
- Dashboard demonstrativo com layout responsivo
- Estrutura técnica preparada para crescimento
- Documentação e regras de projeto

## Fora do MVP (nesta etapa e próximas fases)

- Autenticação real
- Banco de dados e Supabase
- Multiempresa funcional
- Agenda, cadastros e financeiro operacionais
- Cobrança recorrente e teste gratuito automatizado
- Integrações de pagamento (Stripe, Mercado Pago)
- Chatbot, inteligência artificial, marketing e disparo em massa no WhatsApp
- Painel administrativo global

WhatsApp **transacional** (lembretes de agendamento via Cloud API oficial) está implementado no código; o envio real depende da conta Meta, templates aprovados e variáveis na Vercel. Ver `docs/WHATSAPP_SETUP.md`.

Estoque operacional (produtos, movimentações, fornecedores e lotes) está implementado **sem PDV**. Ver `docs/INVENTORY.md`.

## Teste gratuito

PetGestor oferece **72 horas de teste gratuito** sem exigir meio de pagamento.

- Constantes: `TRIAL_DURATION_HOURS = 72`, `TRIAL_DURATION_DAYS = 3` (marketing)
- Início: criação da empresa (onboarding)
- Fim: `trial_ends_at = trial_started_at + 72 hours` (PostgreSQL)
- Posicionamento: **“Teste grátis por 3 dias”** e **“Sem cartão”**
- Após expiração: acesso operacional suspenso até assinatura `active`
- Cobrança Mercado Pago: Etapa 10B implementada — checkout pós-trial via preapproval

Ver `docs/SUBSCRIPTIONS.md` e `docs/MERCADO_PAGO_SETUP.md`.
