# Meta Pixel

Pixel ID (produção): configurar em `NEXT_PUBLIC_META_PIXEL_ID=1060650046671796` na Vercel.

Código central: `src/lib/analytics/meta-pixel.ts`  
Loader: `src/components/analytics/meta-pixel.tsx` (root layout via `MetaPixelRoot`)

## Eventos

| Evento | Tipo | Quando |
|--------|------|--------|
| PageView | padrão | 1ª carga (snippet) + mudanças de rota (SPA) |
| SignupStarted | custom | Dono escolhe “Sou dono ou gestor” no cadastro |
| CompleteRegistration | padrão | Empresa criada com sucesso (`?meta_conv=trial_started`) |
| StartTrial | custom | Mesmo momento do CompleteRegistration (trial 7 dias no INSERT) |
| InitiateCheckout | padrão | Submit do plano em `/assinatura` (antes do redirect MP) |
| onboarding_started | custom | Usuário inicia configuração guiada |
| onboarding_skipped | custom | Usuário pula o tutorial guiado |
| service_created | custom | Primeiro serviço detectado no onboarding |
| employee_created | custom | Primeiro funcionário detectado |
| customer_created | custom | Primeiro tutor+pet detectados |
| first_appointment_created | custom | Primeiro agendamento detectado |
| workflow_viewed | custom | Fluxo de atendimento visualizado |
| finance_viewed | custom | Introdução financeira visualizada |
| onboarding_completed | custom | Onboarding de ativação concluído |

Helpers: `trackOnboardingEvent` em `src/features/onboarding-tour/analytics.ts` (nunca bloqueia a UI).

**Purchase / pagamento confirmado:** não dispara no browser (nem em `/assinatura/retorno`). Preparar Conversions API no webhook depois.

## Deduplicação

- SignupStarted / CompleteRegistration / StartTrial / InitiateCheckout: `sessionStorage`
- PageView SPA: ignora o primeiro effect (já coberto pelo snippet) e evita path repetido
- Query `meta_conv` é removida da URL após disparar

## Dev vs produção

- **Produção** + ID definido → Pixel ativo
- **Development** → inativo, salvo `NEXT_PUBLIC_META_PIXEL_DEBUG=true`

## Testar no Events Manager

1. Vercel: `NEXT_PUBLIC_META_PIXEL_ID=1060650046671796`
2. Meta Events Manager → Test Events
3. Abrir o site → PageView
4. Cadastro dono → SignupStarted → após sucesso → CompleteRegistration + StartTrial
5. Assinatura → InitiateCheckout
