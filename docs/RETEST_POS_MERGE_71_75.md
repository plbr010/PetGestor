# Reteste ponta a ponta — pós-merge PRs #71–#75

Reteste focado após o merge do PR #77: `docs/RETEST_POS_PR_77.md`.

**Data:** 14/09/2026  
**Ambiente:** produção `https://pet-gestor-sepia.vercel.app` (deploy alinhado ao merge do #75, `962f48c`)  
**HEAD testado:** `main` @ `962f48c`  
**Regra desta sessão:** sem migrations, sem alteração de código de produto, sem PR de correção.

Contas usadas:

- Empresa A (demo): Pet Shop Amigo Fiel / Mariana  
- Empresa B (cadastro real nesta sessão): Pet Shop Empresa B / Reteste Empresa B — trial canônico de 7 dias

Automação de apoio (sem mudar o produto):

- `npm run lint` — OK  
- `npm run typecheck` — OK  
- `npm run test` — **125 arquivos / 1268 testes OK**  
- `npm run build` — OK (warning de `metadataBase` só no build local sem `APP_URL`; produção resolve canonical/sitemap corretamente)

---

## Veredito

**O sistema não está pronto para produção paga / GA.**

Os blocos da auditoria **#71–#75 funcionam juntos na superfície pública, no cadastro/trial, no isolamento A×B e no CRUD básico** (tutores, pets, serviços, agenda criar/editar/reagendar/confirmar/cancelar). Restam falhas reais de robustez (paginação), um fluxo de recuperação de senha que não completou, e lacunas de prova ao vivo (OS até `completed`, pacote usar/saldo, financeiro pagar/reabrir, login de funcionário).

**Score geral de qualidade: 73 / 100**

---

## PASSOU / FALHOU por módulo

| Módulo | Resultado | Notas |
|---|---|---|
| Landing (hero, CTAs, preços, responsivo) | **PASSOU** | Hero, Teste grátis → `/cadastro`, Ver demonstração → `/#demonstracao` (não `/dashboard`), Entrar → `/entrar`. Mensal R$ 89,90 e anual R$ 799,00 lado a lado (economia R$ 279,80 / R$ 66,58/mês). Desktop, tablet e mobile OK. |
| SEO básico | **PASSOU** | `/` title + canonical + `index,follow`. `/cadastro` indexável no sitemap. `/entrar` `noindex, follow`, fora do sitemap. Rotas técnicas `noindex,nofollow`. `robots.txt` e `sitemap.xml` corretos. |
| Cadastro | **PASSOU** | Wizard dono/funcionário. Validação de campos. Cadastro da Empresa B entrou no dashboard com trial de 7 dias. |
| Confirmação de e-mail | **PARCIAL** | Produção devolveu **sessão imediata** (confirmação aparentemente desligada). `/verifique-email` não foi exercitado neste ambiente. |
| Login | **PASSOU** | Erro genérico com senha errada. Demo e Empresa B autenticam. |
| Logout | **PASSOU** | Sai para `/entrar`. `/dashboard` anônimo redireciona para `/entrar`. |
| Recuperar senha | **FALHOU** | UI e validação vazia OK. Submissão devolveu “Serviço temporariamente indisponível” em vez da mensagem anti-enumeração. |
| Nova senha | **NÃO PROVADO** | Depende do e-mail de recovery. |
| Convite | **PARCIAL** | Caminho “Sou funcionário” não enumera convite. Fluxo completo (e-mail + aceitar) não executado. |
| Onboarding | **PASSOU** | Empresa nova: trial 7 dias, checklist/tutorial, métricas zeradas. |
| Dashboard | **PASSOU** | KPIs, navegação, busca, estoque baixo, PDV. Demo com 5 tutores / 5 pets / 4 serviços / 3 funcionários. |
| Tutores | **FALHOU** (paginação) | CRUD, busca, empty state e bloqueio de arquivo com pets ativos **PASSOU**. `?page=2` **quebra o dashboard**. |
| Pets | **PARCIAL** | CRUD, tutor obrigatório, espécies OK. Porte é do agendamento (não do pet) — alinhado ao modelo. `?page=2` não crasha, mas mostra **“0 pets cadastrados”** com pets existentes. |
| Serviços | **PARCIAL** | CRUD, preço por porte (R$ 85–165), edição de preço, catálogo de pacotes OK. `?page=2` crash. Idempotência/concorrência de RPC **não reproduzida ao vivo**. |
| Funcionários | **PARCIAL** | Lista + ficha Rafaela (serviços + jornada 08:00–18:00) OK. `?page=2` crash. Intervalo semanal **não está no seed**; edição do time picker não foi concluída. Convite de login não enviado. |
| Agenda | **PASSOU** (núcleo) | Dia/semana, criar, snapshot R$ 135 / 1h45 (Grande), editar notas, reagendar 14:00→16:00 **preservando snapshot**, confirmar, cancelar, horário passado, conflito prevenido (slot ocupado some do dropdown). |
| Atendimento / OS | **NÃO PROVADO** | Check-in/máquina `waiting → completed` e cancelamento de OS **não fechados ao vivo** nesta sessão (sessão demo entrou em rate limit / tempo). |
| Pacotes | **PARCIAL** | Catálogo “Pacote 4 Banhos” visível. Compra/uso/saldo/expiração **não fechados ao vivo**. |
| Financeiro | **PARCIAL** | Resumo da Empresa A **PASSOU** (recebido R$ 1.077,80 / despesas R$ 890,00 / líquido R$ 187,80, filtros de período). Receita automática de OS, pagamento, cancelamento e reabertura **não fechados ao vivo**. |
| Relatórios | **PASSOU** | Visão geral + atendimentos, clientes, pets, equipe, PDV, estoque, pacotes carregam. Presets (Hoje, 7 dias, Mês…) e **Exportar CSV** visíveis. Empresa B: zeros coerentes. |
| Permissões A×B | **PASSOU** | Empresa B em UUID de tutor/pet/agenda/serviço da Empresa A → **404 genérico**, sem vazamento. Lista de tutores B vazia. Financeiro B não mostra R$ 1.077 da A. `/admin` → 404. |
| Funcionário vs admin | **NÃO PROVADO** | Empregados demo não têm login. Sem convite + e-mail não há sessão `staff`. Guards existem no código (`route-permissions`, perfis). |
| Segurança (RLS/IDOR/rotas/headers/robots) | **PASSOU** (escopo testado) | Rotas autenticadas 307→`/entrar`. IDOR 404. Headers: `nosniff`, `DENY`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy, HSTS. `/api/dev/*` → 404 em produção. CSP completa **ainda não** (decisão do #74/#75). |
| Mobile | **PASSOU** (landing) / **PARCIAL** (app) | Landing 375px + menu. Dashboard autenticado visto em desktop; viewport autenticado 375px não foi o foco após o rate limit. |
| Edge cases | **FALHOU** (paginação) | URL `?page=2` além da última página crasha vários módulos. Empty search OK. Duplo submit / concorrência de duas abas / botão voltar **não fechados**. |

---

## Bugs restantes

### Crítico

Nenhum bug **crítico** comprovado (sem vazamento A→B, sem RCE, sem quebra total do cadastro/login/landing).

### Alto

1. **Recuperação de senha não conclui o caminho feliz**  
   `/recuperar-senha` com e-mail inexistente retornou *“Serviço temporariamente indisponível. Tente novamente em alguns minutos.”* em vez da mensagem anti-enumeração. Pode ser fail-closed do BLOCO 8 (`AUTH_RECOVERY_SECRET` / RPC) **ou** rate limit desta sessão. **Bloqueia “esqueci minha senha” até ser retestado em isolamento.**  
   Nova senha / marker one-time **não foram provados**.

2. **Confirmação de e-mail desligada em produção (configuração)**  
   `signUp` devolveu sessão e dashboard na hora. Qualquer um pode cadastrar com o e-mail de outra pessoa. Se for intencional para trial, precisa estar documentado; se não, é falha de Auth.

### Médio

3. **Paginação fora do intervalo derruba o dashboard**  
   Autenticado, `/dashboard/tutores?page=2`, `/dashboard/servicos?page=2`, `/dashboard/funcionarios?page=2` mostram *“Erro ao carregar o dashboard”* + texto em inglês do Next (“An error occurred in the Server Components render…”).  
   Causa provável: `.range()` do PostgREST (`PGRST103`) vira `throw` em `getCustomers` / serviços / funcionários.  
   Pets **não crasha**, mas pior: mostra **“0 pets cadastrados”** com dados reais (erro engolido).  
   A UI não oferece “página 2” com poucos registros; o bug aparece por URL direta, bookmark ou página que ficou vazia depois de arquivar.

4. **Fluxos OS / pacote / financeiro operacional sem prova ao vivo nesta sessão**  
   Não é um defeito visual isolado: o reteste não fechou check-in → `completed`, consumo de pacote, receita automática da OS, pagar/cancelar/reabrir. O overview financeiro da demo está coerente, mas o contrato da auditoria pedia o fluxo completo.

5. **Login de funcionário / perfil operacional sem prova ao vivo**  
   Não há como afirmar que staff não acessa financeiro/relatórios/admin além do código e do 404 de `/admin` para owner B.

### Baixo

6. **Título genérico em `/recuperar-senha` e `/nova-senha`** (`PetGestor — Gestão simples para pet shops`) — robots OK, title específico não.

7. **404 autenticado ainda oferece CTA “Teste grátis por 7 dias”.**

8. **`error.tsx` do dashboard replica a mensagem de produção do Next em inglês.**

9. **Sheet rápido da agenda** pode mostrar toast “Agendamento cancelado” com badge ainda “Confirmado” até o refresh; a **página de detalhe** mostrou Cancelado corretamente.

10. **Input `type="date"`** da receita manual apareceu com placeholder `mm/dd/yyyy` (locale do browser), não `dd/mm/yyyy`.

11. **CSP completa ausente** — só `frame-ancestors 'none'` (aceito nos PRs #74/#75).

12. **`npm audit` (produção):** 8 issues em dependências transitivas (`qs` critical/high, `sharp`/`libvips` high). Não exploradas.

---

## Regressões encontradas

Nenhuma regressão **clara** introduzida pelos PRs #71–#75:

| PR | O que deveria ter corrigido | Neste reteste |
|---|---|---|
| #71 | `authorized` ≠ acesso pago | Não houve pagamento MP real. Tela `/assinatura` da Empresa B mostra **TRIAL 7 dias**, R$ 89,90, sem badge de plano pago. |
| #72/#73 | Serviço+preços+ficha atômicos / idempotência | CRUD de serviço e preços por porte funcionam. Concorrência SQL **não reproduzida**. |
| #74/#75 | Landing, a11y, headers, SEO fail-closed | **Confirmado em produção:** CTAs, preços, robots, sitemap, canonical, headers. |

O crash de paginação e o recovery indisponível **não parecem ter sido introduzidos** por #71–#75 (vêm de listagens/Auth anteriores). Também **não foram cobertos** por esses PRs.

Não é regressão: agenda do dia da demo em 0 — seed antigo, não “hoje”. Trial da demo em ~352 dias — seed proposital.

---

## O que foi exercitado com evidência

- Landing + preços + mobile menu  
- SEO/headers/robots/sitemap via HTTP  
- Cadastro Empresa B + trial 7 dias + `/assinatura`  
- Login/logout demo  
- Tutores: busca, edição (Ana Silva), bloqueio de arquivo com pet ativo, empty search  
- Pets: tutor obrigatório, edição Rex  
- Serviços: Banho e tosa por porte; criar/editar “Hidratação Extra Reteste” R$ 40→45  
- Agenda: criar Thor/Banho e tosa/Rafaela 14:00, snapshot, confirmar, notas, reagendar 16:00, cancelar, horário passado, conflito via dropdown  
- IDOR null UUID e UUID da Empresa A na sessão B → 404  
- Relatórios (todos os submódulos) + CSV na Empresa B  
- Financeiro overview da Empresa A  

---

## Pronto para produção?

**Não**, para cobrança real / GA.

Pode seguir **trial fechado / beta** se:

1. A paginação `page` inválida deixar de crashar (e pets deixar de zerar o total).  
2. Recovery for retestado em isolamento (secret + RPC + um e-mail real).  
3. Confirmação de e-mail for uma decisão explícita.  
4. Um ciclo curto fechar OS `completed` + receita automática + um pacote vendido/usado + um login staff.

---

## Score (0–100)

| Área | Peso | Nota |
|---|---:|---:|
| Landing / SEO / headers | 12 | 11 |
| Auth / onboarding / trial | 15 | 10 |
| CRUD operacional (tutores/pets/serviços/agenda) | 25 | 20 |
| OS / pacotes / financeiro profundo | 18 | 8 |
| Relatórios | 8 | 7 |
| Isolamento multi-tenant | 12 | 11 |
| Robustez / edge / i18n de erro | 10 | 6 |
| **Total** | **100** | **73** |

**73/100** — produto usável no caminho feliz do gestor, auditoria #71–#75 não desmontou o que já estava mergeado, mas **não é GA**.
