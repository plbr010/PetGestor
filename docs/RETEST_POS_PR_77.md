# Reteste final focado — pós-merge PR #77

**Data:** 15/09/2026  
**Ambiente:** produção `https://pet-gestor-sepia.vercel.app`  
**HEAD testado:** `main` @ `f1f38a6` (`fix: recovery anti-enumeração e paginação fora do intervalo (#77)`)  
**Deploy GitHub Production:** `f1f38a6` em 2026-09-15T01:50:26Z  
**Regra desta sessão:** sem migrations, sem alteração de código de produto, sem correção. Relatório apenas.

Contas usadas:

| Papel | Identidade | Notas |
|---|---|---|
| Empresa A (demo) | Pet Shop Amigo Fiel / Mariana `mariana+demo@demo.petgestor.app` | Senha **não** resetada |
| Empresa C (cadastro real) | Pet Shop Reteste 77 / Reteste Owner 77 `pg77owner1789437362@uberip.com` | Sessão imediata no cadastro; trial ~7 dias |
| Conta confirm (cadastro real) | `pg77confirm1789437362@uberip.com` | Também entrou no dashboard sem confirmar e-mail |

Automação na `main` testada:

- `npm test -- --run` — **127 arquivos / 1290 testes OK**
- `npm run lint` — OK  
- `npm run typecheck` — OK  
- `npm run build` — OK (warning de `metadataBase` só no build local sem `APP_URL`)

---

## Configuração real (sem inventar status)

| Item | Como foi verificado | Resultado |
|---|---|---|
| Vercel `AUTH_RECOVERY_SECRET` (≥ 32 bytes, sem `NEXT_PUBLIC_`) | Painel Vercel **não acessível** (CLI ausente, sem leitura de env) | **NÃO VERIFICADO no painel** |
| Supabase Redirect URLs (`/auth/callback…`) | Painel Supabase **não acessível** (MCP `mcp_auth` expirou) | **NÃO VERIFICADO no painel** |
| Authentication → Providers → Email → **Confirm email** | Painel **não acessível** | **NÃO VERIFICADO no painel** |
| Site URL | Painel **não acessível** | **NÃO VERIFICADO no painel** |

Inferência **só** a partir do comportamento ao vivo (não substitui o painel):

- Cadastro novo → sessão e `/dashboard` imediatos ⇒ **Confirm email está desligado** (ou auto-confirm) neste projeto Auth.
- `/recuperar-senha` devolve *“Serviço temporariamente indisponível…”* (não a mensagem anti-enumeração, não rate-limit). Depois do #77, `user_not_found` no GoTrue viraria sucesso genérico. Este sintoma continua sendo **fail-closed** (secret ausente, SMTP, redirect recusado ou 5xx) — **não** o bug de enumeração do reteste #76.

Deploy do #77 **está** em produção: GitHub Deployment `f1f38a6` + `/verifique-email` com o título/copy novos.

---

## Veredito

**O sistema não está pronto para produção paga / GA.**

O #77 **corrigiu em produção** o crash de paginação `?page=2` em tutores e pets (redirect para a lista válida, totais corretos). O isolamento multi-tenant continua sólido (Empresa C × UUIDs da A → 404 genérico).

Permanecem **dois bloqueios de Auth em produção** (configuração, não mascaráveis no frontend): recovery indisponível e confirmação de e-mail desligada. OS completa, pacotes, financeiro operacional, login staff e mobile autenticado **não foram fechados ao vivo** nesta sessão.

**Score geral de qualidade: 74 / 100**

---

## PASSOU / FALHOU / NÃO PROVADO

| Item pedido | Resultado | Evidência |
|---|---|---|
| Recovery e-mail inexistente (anti-enum) | **FALHOU** | `/recuperar-senha` + `nao.existe.pg77@example.com` → *“Algo deu errado. Serviço temporariamente indisponível. Tente novamente em alguns minutos.”* |
| Recovery e-mail existente (mesma mensagem) | **NÃO PROVADO** | Não repetido após o fail-closed (evitado reset da demo; owner também não recebeu caminho feliz) |
| E-mail de recovery recebido (C) | **NÃO PROVADO** | Serviço indisponível; inbox mail.tm sem mensagem de recovery |
| Abrir link / nova senha / login antiga vs nova / replay (D–H) | **NÃO PROVADO** | Dependem de C |
| Token expirado/inválido em recovery | **NÃO PROVADO** | Sem link real |
| Confirm email = ON (painel) | **NÃO VERIFICADO** | Sem acesso ao dashboard Supabase |
| Cadastro → `/verifique-email` → confirmar → entrar | **FALHOU** | Cadastro `pg77confirm…` e `pg77owner…` foram para `/dashboard` na hora, tour de onboarding, trial ~7 dias |
| Link confirmação sem params | **PASSOU** | `307` → `/auth/erro?motivo=confirmacao-invalida`. Copy genérica, sem vazamento |
| Link confirmação token inválido | **PASSOU** | `307` → `/auth/erro?motivo=confirmacao-falhou`. Copy genérica |
| `/dashboard/tutores?page=2` | **PASSOU** | Após espera: URL volta para `/dashboard/tutores`, **6 tutores cadastrados**, lista visível. Sem crash Next/PGRST103 |
| `/dashboard/pets?page=2` | **PASSOU** | Mesmo padrão: redirect para `/dashboard/pets`, total 6, sem crash |
| `/dashboard/servicos?page=2` | **NÃO PROVADO** | Mesmo helper; não reexecutado nesta sessão após o wait protocol |
| `/dashboard/funcionarios?page=2` | **NÃO PROVADO** | Idem |
| `?page=0` / `-1` / `abc` / `999999` / busca+página | **NÃO PROVADO** | Não exercitados ao vivo nesta sessão |
| Arquivar último item da última página | **NÃO PROVADO** | Listas demo cabem em 1 página |
| OS `waiting → in_progress → ready → completed` | **NÃO PROVADO** | Fluxo de criação de agendamento não foi concluído |
| OS `CANCELLED` | **NÃO PROVADO** | — |
| Pacotes criar/comprar/usar/saldo/refresh/além do saldo | **NÃO PROVADO** | — |
| Financeiro receita auto/manual, despesa, pagar, reabrir, cancelar | **NÃO PROVADO** | Overview da demo **não** reaberto nesta sessão (havia PASSOU no #76) |
| Login staff + perfis (recepção/operacional/financeiro) | **NÃO PROVADO** | Convite não enviado/aceito |
| Mobile autenticado ~375px | **NÃO PROVADO** | Landing pública 375px **PASSOU** no #76; app autenticado não nesta sessão |
| Isolamento A × C | **PASSOU** | Tutor `0b032c19-…` e pet `db36c6e5-…` da A, na sessão C → 404 genérico. Listas C zeradas. `/admin` → 404 |
| Landing / preços / CTAs | **PASSOU** | Teste grátis → `/cadastro`; Ver demonstração → `/#demonstracao`; mensal **R$ 89,90**; anual **R$ 799,00**; economia R$ 279,80 |
| Login/logout / `/dashboard` anônimo | **PASSOU** | Demo autentica. Anônimo `/dashboard` → `307` `/entrar` |
| Serviço by_size | **PASSOU** | Banho e tosa: Gigante R$ 165 / 2h; Grande R$ 135 / 1h45; Médio R$ 105 / 1h30; Pequeno R$ 85 / 1h15 |
| Headers / robots / sitemap | **PASSOU** | `nosniff`, `DENY`, `frame-ancestors 'none'`, HSTS, Permissions-Policy. `robots.txt` e sitemap só `/` + `/cadastro`. `/entrar` `noindex, follow`. `/api/dev/*` → 404 |
| Agenda criar/reagendar/confirmar/cancelar | **NÃO PROVADO** nesta sessão | Núcleo **PASSOU** no reteste #76 |

---

## Bugs

### Crítico

Nenhum vazamento A→C, RCE ou quebra da landing/login.

### Alto

1. **Recuperação de senha ainda fail-closed em produção**  
   - **Rota:** `/recuperar-senha`  
   - **Módulo:** Auth / recovery  
   - **Passos:** logout → Recuperar senha → e-mail inexistente válido → Enviar instruções  
   - **Esperado:** *“Se houver uma conta associada a esse e-mail, enviaremos as instruções.”*  
   - **Real:** *“Serviço temporariamente indisponível. Tente novamente em alguns minutos.”*  
   - **Severidade:** Alta. Bloqueia “esqueci minha senha”. Causa **não** é o mapeamento anti-enum do #77; é config (secret / SMTP / Redirect URLs) **não lida no painel nesta sessão**.

2. **Confirmação de e-mail desligada (prova ao vivo, não só config)**  
   - **Rota:** `/cadastro` → `/dashboard`  
   - **Módulo:** Auth / signup  
   - **Passos:** wizard dono com e-mail real (`pg77confirm1789437362@uberip.com` e `pg77owner1789437362@uberip.com`)  
   - **Esperado:** `/verifique-email`, sem sessão, e-mail de confirmação, `/auth/confirm`, só então onboarding/dashboard  
   - **Real:** dashboard imediato, tour “Bem-vindo ao PetGestor”, trial ~6d23h / 7d  
   - **Correção:** Supabase → Authentication → Providers → Email → **Confirm email = ON** (+ Site URL / Redirect URLs / template). Não contornar no frontend.

### Médio

Nenhum bug de paginação comprovado após o protocolo de espera. Um primeiro screenshot de tutores `?page=2` mostrou área principal em branco **com a URL ainda em `page=2`**; o reteste com espera de ~10s mostrou **redirect** e lista completa. Tratar o branco como corrida de carregamento, não como regressão persistente do #77.

Observação **não comprovada** (sem evidência de persistência): no formulário de novo agendamento o profissional chegou a aparecer como Pedro Henrique após interação. **Não** fecha bug sem screenshot do submit/resultado.

### Baixo

Inalterados em relação ao #76 (títulos genéricos em recovery, CTA “Teste grátis” no 404 autenticado, CSP completa ausente, `npm audit` transitivo).

---

## O que o #77 resolveu de fato em produção

| Pendência do `docs/RETEST_POS_MERGE_71_75.md` | Neste reteste |
|---|---|
| Tutores `?page=2` crash | **Corrigido** (redirect + 6 tutores) |
| Pets `?page=2` total zerado / crash | **Corrigido** (redirect + 6 pets) |
| Serviços/funcionários `?page=2` | Código compartilhado; **não reexecutado** ao vivo |
| Recovery anti-enum | Código no deploy; **produção ainda fail-closed** |
| Confirm email | Código de `/verifique-email` no ar; **toggle Auth continua off** |

---

## Score (0–100)

| Área | Peso | Nota |
|---|---:|---:|
| Landing / SEO / headers | 12 | 11 |
| Auth / onboarding / trial | 15 | 8 |
| CRUD operacional (tutores/pets/serviços/agenda) | 25 | 21 |
| OS / pacotes / financeiro profundo | 18 | 8 |
| Relatórios | 8 | 7 |
| Isolamento multi-tenant | 12 | 11 |
| Robustez / edge / i18n de erro | 10 | 8 |
| **Total** | **100** | **74** |

**74/100** — paginação do #77 vale em produção nas listas provadas; Auth de recovery/confirmação e os fluxos operacionais profundos **impedem GA**.

---

## Pronto para produção paga?

**Não.**

Pode seguir trial/beta se:

1. `AUTH_RECOVERY_SECRET` + Redirect URLs + SMTP forem conferidos no painel e recovery retestado até nova senha + one-time.  
2. **Confirm email = ON** e um cadastro novo passar por `/verifique-email`.  
3. Um ciclo curto fechar OS `completed` + pacote usar/saldo + um login staff + mobile autenticado.
