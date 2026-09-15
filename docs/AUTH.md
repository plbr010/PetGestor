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
4. **Regra de produto (obrigatória):** novo cadastro **não** entra no sistema até confirmar o e-mail.
5. Com **Confirm email** ligado no Auth: `signUp` **sem sessão** → `/verifique-email` → link → `/auth/confirm` → onboarding/dashboard.
6. Se o Auth devolver sessão imediata, o app **não descarta a sessão no frontend** (isso mascararia a configuração). O caminho de onboarding imediato só existe como reflexo do toggle desligado — não é o comportamento desejado.

## Confirmação de e-mail (SSR)

**Configuração obrigatória no Supabase (não dá para ligar pelo código do app):**

| Onde | Opção | Valor esperado |
|---|---|---|
| Painel do projeto → **Authentication** → **Providers** → **Email** | **Confirm email** | **ON** (ligado) |
| **Authentication** → **URL Configuration** | **Site URL** | `https://pet-gestor-sepia.vercel.app` |
| **Authentication** → **URL Configuration** | **Redirect URLs** | ver lista abaixo |
| **Authentication** → **Email Templates** → Confirm signup | Link | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard` |

Redirect URLs (produção):

```text
https://pet-gestor-sepia.vercel.app/**
https://pet-gestor-sepia.vercel.app/auth/confirm**
https://pet-gestor-sepia.vercel.app/auth/callback**
https://pet-gestor-sepia.vercel.app/verifique-email
https://pet-gestor-sepia.vercel.app/nova-senha
https://pet-gestor-sepia.vercel.app/convite
```

O link do e-mail aponta para:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
```

A rota `/auth/confirm`:

1. Valida `token_hash` e `type` (`email`, `signup`, `invite`).
2. Chama `verifyOtp`.
3. Convite pendente / `signup_mode=staff` → `/convite`.
4. Owner com metadata válida → `complete_onboarding`.
5. `next` passa por `getSafeRedirectPath` (allowlist interna). Sem dados de onboarding → `/onboarding`.

`/verifique-email` é a tela pós-cadastro enquanto o e-mail não foi confirmado. Reenvio usa a mesma mensagem genérica para e-mail existente e inexistente (anti-enumeração).

Como o app interpreta a resposta do Auth (sem inventar o toggle):

- `signUp` devolve **sessão** → Confirm email está **desligado** ou auto-confirmado; o app segue onboarding/dashboard. **Corrigir no painel**, não no cliente.
- `signUp` **sem sessão** → confirmação habilitada; `/verifique-email` até o link.

## Login

1. Server Action valida e-mail/senha.
2. Em erro: mensagem genérica (“E-mail ou senha incorretos.”).
3. Em sucesso: verifica membership via RLS.
4. Com empresa → `/dashboard`; sem empresa → `/onboarding`.

## Onboarding

Usuários autenticados sem empresa são enviados para `/onboarding`.

A Server Action chama a função PostgreSQL `complete_onboarding(full_name, company_name, phone)` que:

- exige `auth.uid()`;
- serializa o usuário com `pg_advisory_xact_lock`;
- cria/atualiza `profiles`;
- se já existe **membership ativa**, devolve a mesma `company_id` (idempotente);
- se só existe membership **revogada**, falha com `membership_revoked` — não ressuscita acesso e não cria outra empresa;
- cria `companies` + `company_members` (role `owner`) só na primeira conclusão;
- o trial vem do trigger canônico em `companies` (duração/plano não mudam neste bloco).

## Sessão SSR e Proxy

- **Proxy:** `src/proxy.ts` + `src/lib/supabase/proxy.ts`
- Atualiza cookies via `getClaims()` em cada requisição relevante.
- **Não substitui** autorização server-side em layouts e actions.

Layouts protegidos usam `getClaims()` (nunca `getSession()` para autorização).

## Recuperação de senha

`?next=/nova-senha` **não** prova recovery. O parâmetro é controlável e só passa pela allowlist de redirect.

Prova server-side:

1. `/recuperar-senha` gera um **ticket HMAC** (`typ=recovery_ticket`, TTL 1h) e envia `resetPasswordForEmail` com  
   `redirectTo = {APP_URL}/auth/callback?flow=recovery&rt={ticket}`.
2. `/auth/callback` exige `exchangeCodeForSession` **e** ticket `rt` válido **e** `flow=recovery`.  
   Só então gera um **token opaco** (32 bytes) e grava **somente o SHA-256** em `private.password_recovery_markers` (`user_id`, `expires_at`, `consumed_at`). O cookie HttpOnly `pg_pwd_recovery` recebe só o token (TTL 15 min, `Path=/nova-senha`, `Secure` em production, `SameSite=lax`).
3. `/nova-senha` usa `requireRecoverySession`: sessão + peek do hash (não consumido, não expirado, mesmo `user_id`). Sessão normal (login) é recusada.
4. `updateRecoveryPasswordAction` valida a senha **antes** de consumir. O consumo é `UPDATE … WHERE consumed_at IS NULL AND expires_at > now() RETURNING`. Depois chama `updateUser` e apaga o cookie. Replay da cópia do cookie falha. Se o provider falhar após o consumo, o marker **não** é reativado.

Marcador adulterado, expirado ou de outro usuário é recusado. Alterar senha logado em **Configurações** continua em `updatePasswordAction` (sessão da conta, sem marcador).

Segredo: **somente** `AUTH_RECOVERY_SECRET` (≥ 32 bytes aleatórios). Sem esse valor o recovery falha fechado (mensagem genérica) **antes** de assinar/enviar ticket. Não há fallback para `NEXT_PUBLIC_*` nem `SUPABASE_SERVICE_ROLE_KEY`. Obrigatório na Vercel (Production e Preview). Ausência **não** é rate limit: a mensagem de RPC/rate-limit é outra (`Não foi possível processar sua solicitação agora…` / `Muitas tentativas…`).

Mensagem genérica (anti-enumeração) para e-mail existente **e** inexistente, inclusive quando o GoTrue responde `user_not_found` / e-mail inválido: “Se houver uma conta associada a esse e-mail…”

Erro real do provider (SMTP, 5xx, redirect URL fora da allowlist) / URL de produção ausente / secret ausente: “Serviço temporariamente indisponível…” — sem revelar se a conta existe.

Redirect URL de recovery (allowlist do Auth): `{APP_URL}/auth/callback?flow=recovery&rt=…` — incluir `https://pet-gestor-sepia.vercel.app/auth/callback**` (ou `/**`).

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

Helper `getSafeRedirectPath` aceita apenas caminhos internos da allowlist (`/dashboard`, `/onboarding`, `/convite`, `/nova-senha`, `/entrar`, etc.). Rejeita `https://`, `//`, `javascript:` e paths fora da lista.

Callback sem `code` → `/auth/erro?motivo=callback-invalido`. Troca de código falhou → `callback-falhou`.

## Rate limiting

Além dos limites nativos do Supabase Auth, ações sensíveis passam por `public.consume_auth_rate_limit(p_action, p_bucket_key)`:

- tabela `private.auth_rate_limit_buckets` (chave = SHA-256 de ação + e-mail + tenant + IP);
- UPSERT + `pg_advisory_xact_lock` (atômico sob concorrência);
- **política só no banco** (`private.auth_rate_limit_policy`): login 8/15min, cadastro 5/15min, recovery 5/15min, reenvio 3/15min, convite/lookup 10/15min;
- o caller **não** envia `limit`, `window` nem relógio; o relógio é `now()` do Postgres;
- action fora da allowlist falha (`invalid_rate_limit_action`);
- a assinatura antiga `(bucket_key, limit, window, now)` foi **revogada e removida**;
- `EXECUTE` da primitive `(text, text)`: **somente `service_role`**. `anon` e `authenticated` não executam;
- o app consome via `createSupabaseAdminClient()` no módulo server-only `rate-limit.ts`;
- buckets expirados são limpos de forma oportunística (`updated_at` há mais de 2h — fora de qualquer janela ativa).

Ao exceder: “Muitas tentativas. Aguarde alguns minutos e tente novamente.”

Se a RPC estiver ausente/incompatível:

- **production:** fail-closed — não chama o provider de Auth; mensagem genérica “Não foi possível processar sua solicitação agora. Tente novamente em instantes.”
- **development/test:** fail-open documentado (permite seguir) para não bloquear o fluxo local antes da migration.

**MIGRATIONS:**  
`20260911400000_bloco8_auth_onboarding_rate_limit.sql` (tabela + API inicial)  
`20260912090000_bloco8_rate_limit_policy_server_side.sql` (política interna; revoga a API vulnerável)

## Convite de funcionário (e-mail)

Ao conceder acesso em **Funcionários → Acesso ao sistema**, se ainda **não** existir conta Auth **confirmada** para o e-mail:

1. RPC `grant_employee_access` cria/reabre o convite pendente em `company_member_invites`.
2. O servidor chama `auth.admin.inviteUserByEmail` (requer `SUPABASE_SERVICE_ROLE_KEY`).
3. O painel também gera um **link de convite** para o dono copiar e enviar no WhatsApp se o Gmail falhar.
4. O funcionário abre o link → confirma / define senha → cai em `/convite` e aceita o vínculo.

**Importante:** usuários Auth criados pelo convite (ainda sem `email_confirmed_at`) **não** são auto-vinculados. Só contas já confirmadas entram no caminho `linked`.

O pré-cadastro em `/cadastro` → “Sou funcionário” **não** revela se o e-mail tem convite. O vínculo aparece só depois da autenticação em `/convite` (`peek_pending_invite`).

Se a conta Auth já estiver confirmada, o RPC vincula na hora. Alternativa: `/cadastro` → “Sou funcionário”.

**Migration obrigatória:** `20260821190000_grant_skip_unconfirmed_users.sql`

Diagnóstico SQL: `docs/sql/diagnose-employee-invite.sql`

No Supabase Dashboard → Authentication → URL Configuration, inclua o redirect:

`https://SEU_DOMINIO/auth/confirm`

## SMTP

Desenvolvimento usa e-mail padrão do Supabase (com limites; Gmail costuma cair em spam ou não entregar). SMTP próprio será configurado antes de produção. Use o link copiável no painel como fallback.
