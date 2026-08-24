# PetGestor — Autenticação (Etapa 3)

Documentação dos fluxos de autenticação, sessão SSR e onboarding multi-tenant.

## Visão geral

| Fluxo | Rota(s) | Mecanismo |
|-------|---------|-----------|
| Cadastro | `/cadastro` | `signUp` + metadata de conveniência |
| Verifique e-mail | `/verifique-email` | Página informativa pós-cadastro |
| Confirmação | `/auth/confirm` | `verifyOtp` (token_hash SSR) |
| Login | `/entrar` | `signInWithPassword` |
| Logout | botão no dashboard | `signOut` (Server Action) |
| Onboarding | `/onboarding` | RPC `complete_onboarding` |
| Recuperação | `/recuperar-senha` | `resetPasswordForEmail` |
| Callback PKCE | `/auth/callback` | `exchangeCodeForSession` |
| Nova senha | `/nova-senha`, `/dashboard/configuracoes` | `updateUser` |
| Erro auth | `/auth/erro` | Mensagens amigáveis |

## Cadastro

1. Usuário preenche nome, pet shop, e-mail e senha em `/cadastro`.
2. Server Action valida com Zod e chama `supabase.auth.signUp`.
3. Metadata (`full_name`, `company_name`) é salva **apenas como conveniência** — nunca usada para autorização.
4. **Com confirmação de e-mail habilitada:** redireciona para `/verifique-email`.
5. **Sem confirmação / sessão imediata:** chama `complete_onboarding` e redireciona para `/dashboard`.

## Confirmação de e-mail (SSR)

O link do e-mail aponta para:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
```

A rota `/auth/confirm`:

1. Valida `token_hash` e `type`.
2. Chama `verifyOtp`.
3. Lê metadata do usuário (conveniência).
4. Executa `complete_onboarding`.
5. Redireciona para caminho seguro (`next`).

## Login

1. Server Action valida e-mail/senha.
2. Em erro: mensagem genérica (“E-mail ou senha incorretos.”).
3. Em sucesso: verifica membership via RLS.
4. Com empresa → `/dashboard`; sem empresa → `/onboarding`.

## Onboarding

Usuários autenticados sem empresa são enviados para `/onboarding`.

A Server Action chama a função PostgreSQL `complete_onboarding(full_name, company_name)` que:

- exige `auth.uid()`;
- cria/atualiza `profiles`;
- cria `companies` + `company_members` (role `owner`) atomicamente;
- não duplica empresa se já existir membership.

## Sessão SSR e Proxy

- **Proxy:** `src/proxy.ts` + `src/lib/supabase/proxy.ts`
- Atualiza cookies via `getClaims()` em cada requisição relevante.
- **Não substitui** autorização server-side em layouts e actions.

Layouts protegidos usam `getClaims()` (nunca `getSession()` para autorização).

## Recuperação de senha

1. `/recuperar-senha` envia e-mail com redirect para `/auth/callback?next=/nova-senha`.
2. Callback troca `code` por sessão quando necessário (PKCE).
3. `/nova-senha` exige sessão válida e chama `updateUser`.

Mensagem genérica sempre: “Se houver uma conta associada a esse e-mail…”

## Logout

Server Action `signOutAction`:

1. `supabase.auth.signOut()`
2. `revalidatePath`
3. Redirect `/entrar`

## Redirecionamentos

| Estado | Rota visitada | Destino |
|--------|---------------|---------|
| Não autenticado | `/dashboard` | `/entrar` |
| Não autenticado | `/onboarding` | `/entrar` |
| Autenticado + empresa | `/entrar`, `/cadastro`, `/onboarding` | `/dashboard` |
| Autenticado sem empresa | `/dashboard` | `/onboarding` |

## Open redirect

Helper `getSafeRedirectPath` aceita apenas caminhos internos iniciados por `/`.

## Rate limiting

Limites nativos do Supabase Auth em desenvolvimento. Rate limiting adicional será adicionado antes de produção.

## Convite de funcionário (e-mail)

Ao conceder acesso em **Funcionários → Acesso ao sistema**, se ainda **não** existir conta Auth **confirmada** para o e-mail:

1. RPC `grant_employee_access` cria/reabre o convite pendente em `company_member_invites`.
2. O servidor chama `auth.admin.inviteUserByEmail` (requer `SUPABASE_SERVICE_ROLE_KEY`).
3. O painel também gera um **link de convite** para o dono copiar e enviar no WhatsApp se o Gmail falhar.
4. O funcionário abre o link → confirma / define senha → cai em `/convite` e aceita o vínculo.

**Importante:** usuários Auth criados pelo convite (ainda sem `email_confirmed_at`) **não** são auto-vinculados. Só contas já confirmadas entram no caminho `linked`.

Se a conta Auth já estiver confirmada, o RPC vincula na hora. Alternativa: `/cadastro` → “Sou funcionário”.

**Migration obrigatória:** `20260821190000_grant_skip_unconfirmed_users.sql`

Diagnóstico SQL: `docs/sql/diagnose-employee-invite.sql`

## Redirecionamentos de e-mail (Site URL)

Todos os links de confirmação, convite e recuperação usam a origem resolvida por `getSiteUrl()` / `getAppUrl()`:

1. `APP_URL` (preferida no servidor)
2. `NEXT_PUBLIC_APP_URL` (fallback)
3. `VERCEL_URL` (https, em deploy Vercel)
4. Host da request (dev)
5. `http://localhost:3000` **somente** em desenvolvimento local

Em produção na Vercel, configure **as duas** (ou pelo menos `APP_URL`):

```env
APP_URL=https://pet-gestor-sepia.vercel.app
NEXT_PUBLIC_APP_URL=https://pet-gestor-sepia.vercel.app
```

**Nunca** use `http://localhost:3000` em Production na Vercel.

### Supabase → Authentication → URL Configuration

Configure manualmente no Dashboard do projeto Supabase:

| Campo | Valor |
|-------|--------|
| **Site URL** | `https://pet-gestor-sepia.vercel.app` |
| **Redirect URLs** | ver lista abaixo |

**Redirect URLs** (uma por linha; wildcards `/**` são aceitos):

```text
https://pet-gestor-sepia.vercel.app/**
https://pet-gestor-sepia.vercel.app/auth/confirm
https://pet-gestor-sepia.vercel.app/auth/callback
http://localhost:3000/**
http://localhost:3000/auth/confirm
http://localhost:3000/auth/callback
```

- **Site URL** é o fallback quando o `redirect_to` do e-mail não está na allowlist — se ficar em localhost, o usuário volta para localhost mesmo com a app em produção.
- **Redirect URLs** deve incluir os caminhos usados por `emailRedirectTo` / `redirectTo` (`/auth/confirm`, `/auth/callback`).
- Mantenha `localhost` na allowlist só para desenvolvimento local.

Após alterar Site URL / Redirect URLs, reenvie o e-mail de convite/confirmação (links antigos podem ainda apontar para a URL antiga).


Desenvolvimento usa e-mail padrão do Supabase (com limites; Gmail costuma cair em spam ou não entregar). SMTP próprio será configurado antes de produção. Use o link copiável no painel como fallback.
