# PetGestor — Arquitetura

## Tecnologias

- **Next.js 16** com App Router
- **React 19** e **TypeScript** (modo estrito)
- **Tailwind CSS 4** e **shadcn/ui**
- **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) como backend
- **Zod** e **React Hook Form** / Server Actions para formulários
- **Vitest** e **Testing Library** para testes
- **Lucide Icons** para ícones

## Organização de pastas

```text
src/
  app/           Rotas (public, auth, dashboard, auth handlers)
  components/    UI reutilizável (ui, shared, layout, auth)
  config/        Marca, navegação e dados demonstrativos
  features/      auth, companies, customers, pets, services, employees, appointments, service-orders, finance, inventory, subscription
  lib/
    auth/        Guards, redirects seguros, getClaims helpers
    env/         Validação tipada de variáveis de ambiente
    supabase/    Clientes browser/server, proxy de sessão
  types/         Tipos globais (database.types.ts)
docs/            Documentação do produto e decisões
supabase/
  migrations/    SQL versionado (RLS, multi-tenant)
.cursor/rules/   Regras permanentes para agentes
```

## Multi-tenant

```text
auth.users
    ↓
profiles
    ↓
company_members
    ↓
companies
```

- Um usuário pode participar de várias empresas (futuro).
- Papéis: `owner`, `admin`, `staff`.
- Isolamento via **RLS** no PostgreSQL — ver `docs/DATABASE.md`.

## Supabase

### Clientes

| Arquivo | Uso | API |
|---------|-----|-----|
| `src/lib/supabase/client.ts` | Navegador (Client Components) | `createBrowserClient` |
| `src/lib/supabase/server.ts` | Servidor (RSC, Actions, Route Handlers) | `createServerClient` |
| `src/lib/supabase/proxy.ts` | Proxy de refresh de sessão | `getClaims()` |

Somente variáveis públicas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### Proxy (Next.js 16)

`src/proxy.ts` atualiza tokens via `getClaims()` e repassa cookies ao browser e Server Components.

O Proxy **não substitui** proteção server-side em layouts.

### Autorização server-side

- Identidade: `supabase.auth.getClaims()` (nunca `getSession()` para autorização).
- Membership: consultas RLS em `company_members` / `companies`.
- Onboarding: RPC `complete_onboarding` (SECURITY DEFINER controlado).

## Decisões

1. **Server Components por padrão** — interatividade apenas onde necessário.
2. **Marca centralizada** em `src/config/brand.ts`.
3. **Dados demo** permanecem parcialmente no dashboard (badge demonstrativo); módulos operacionais usam dados reais.
4. **Trial 7 dias** — entitlement calculado no servidor; gate no layout do dashboard e em `requireCompanyContext()`.
4. **Rotas agrupadas** por contexto: `(public)`, `(auth)`, `(dashboard)`.
5. **Service role** — apenas rotas privilegiadas (billing, cron WhatsApp, webhook Meta, painel `/admin`). Operações do pet shop continuam no client autenticado + RLS.
6. **user_metadata** só para pré-preenchimento — nunca para autorização.

## WhatsApp Cloud API

Camada isolada em `src/lib/whatsapp/` (`sendWhatsAppTemplate`). Worker em `src/features/notifications/processor.ts`.

- Cron: `GET/POST /api/cron/whatsapp-notifications` (Bearer `CRON_SECRET`, lote 25)
- Webhook: `/api/webhooks/whatsapp` (verify token + HMAC `x-hub-signature-256`)
- Sem WhatsApp Web, Baileys, Evolution ou chatbot

Guia: `docs/WHATSAPP_SETUP.md`.

## Separação de responsabilidades

| Camada | Responsabilidade |
|--------|------------------|
| `app/` | Rotas, layouts e composição de páginas |
| `features/` | Schemas, actions e queries de domínio |
| `components/` | UI reutilizável |
| `lib/` | Infraestrutura (auth, supabase, utils) |
| `config/` | Constantes de produto |

## Gerenciador de pacotes

O projeto utiliza **npm** exclusivamente.

## Documentação relacionada

- `docs/AUTH.md` — fluxos de autenticação
- `docs/SECURITY.md` — RLS, segredos, redirects
- `docs/DATABASE.md` — schema multi-tenant
- `docs/CUSTOMERS_PETS.md` — tutores e pets
- `docs/SERVICES.md` — catálogo de serviços e preços
- `docs/EMPLOYEES.md` — equipe operacional e horários
- `docs/APPOINTMENTS.md` — agenda, timezone, snapshots e conflitos
- `docs/SERVICE_ORDERS.md` — atendimentos e ordens de serviço
- `docs/WHATSAPP_SETUP.md` — WhatsApp Cloud API (Meta)
- `docs/INVENTORY.md` — estoque, lotes e movimentações
