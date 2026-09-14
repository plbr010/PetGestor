## [0.52.0] — 2026-09-14

### Corrigido — BLOCO 10 (landing, conversão, acessibilidade e security headers)

- CTA “Ver demonstração” deixa de apontar para `/dashboard` (área protegida) e vai para a prévia pública `/#demonstracao`
- Claims da landing alinhadas ao produto real (agenda, tutores/pets, atendimentos/pacotes, equipe, financeiro/estoque/PDV, relatórios). Removido “próximas fases”
- Preço, trial e economia continuam na fonte canônica `src/config/subscription.ts`
- Âncoras `#recursos`, `#como-funciona`, `#precos` e `#demonstracao` com folga para o header sticky
- Menu mobile, skip link, headings, alvos de toque e textos em pt-BR (inclui “Fechar” do sheet)
- Metadata, Open Graph, robots, sitemap e favicon. Sem domínio inventado
- Headers: `nosniff`, Referrer-Policy, Permissions-Policy, `X-Frame-Options: DENY`, CSP só `frame-ancestors 'none'`. HSTS apenas em produção Vercel
- CSP completa **não** implementada neste PR (risco de quebrar Next/Pixel/Supabase/MP)

**Migration nova: NÃO.**

Não reaplica BLOCOs 1–9 / 8.1. Não inicia o reteste ponta a ponta.

## [0.51.3] — 2026-09-14

### Corrigido — hardening BLOCO 8.1 (idempotência de UPDATE por serviço)

- Replay de UPDATE só é válido se a tentativa existente for do **mesmo** `service_id`
- Reusar a mesma idempotency key em outro serviço, mesmo com payload idêntico, vira `idempotency_key_conflict`
- UPDATE serializa a key e o serviço (`advisory lock` + `FOR UPDATE`) até o commit
- Fingerprint do payload permanece sem `service_id` para não invalidar attempts já gravadas
- Vitest não simula concorrência PostgreSQL; reprodutor manual em `docs/sql/repro-bloco81-update-concurrency.sql`

**MIGRATION:** `supabase/migrations/20260914174351_bloco81_idempotency_target_hardening.sql`

Aplicar depois de `20260914172942_bloco81_service_prices_recipe_atomic.sql`. Não edita a migration do PR #72.

Não inicia BLOCO 10.

## [0.51.2] — 2026-09-14

### Corrigido — BLOCO 8.1 (atomicidade serviço + preços + ficha)

- CREATE/UPDATE de serviço passam a gravar core, preços e `service_product_recipes` na **mesma transação**
- Falha na ficha (produto inexistente, arquivado, cross-tenant, quantidade ≤ 0, duplicata) faz rollback de serviço e preços
- Idempotência por `(company_id, operation, idempotency_key)` + fingerprint canônico (ordem da ficha irrelevante)
- UPDATE usa `FOR UPDATE` + `pg_advisory_xact_lock` no serviço
- Permissão real: `services.manage`. Não reabre BLOCO 9 / Mercado Pago

**MIGRATION:** `supabase/migrations/20260914172942_bloco81_service_prices_recipe_atomic.sql`

Diagnóstico somente leitura: `docs/sql/diagnose-service-recipe-atomicity.sql`

Não inicia BLOCO 10.

## [0.51.1] — 2026-09-14

### Corrigido — hardening BLOCO 9 (preapproval authorized ≠ acesso pago)

- `mapPreapprovalStatusToLocal("authorized")` **não** mapeia para `active` e **não** concede acesso (`grantsAccess: false`)
- Período pago só é criado/renovado com payment `approved` obtido via GET `/v1/payments/{id}`, com conferência de valor BRL, plano e tenant locais
- Envelope `subscription_authorized_payment` sem GET do payment **não** ativa
- Checkout e tela de retorno deixam de tratar preapproval `authorized` como assinatura paga confirmada

Não altera schema. **Migration nova: NÃO.**

Não inicia BLOCO 10.

## [0.51.0] — 2026-09-14

### Corrigido — Assinaturas, trial, Mercado Pago, checkout e webhooks (BLOCO 9)

- Fonte canônica de acesso: `computeEntitlement` — status persistido sozinho não libera trial/assinatura vencida
- Trial canônico: **7 dias / 168 horas**; nasce uma vez por empresa (`ON CONFLICT DO NOTHING`); checkout/cancelamento/login não reiniciam
- Planos canônicos em `src/config/subscription.ts`: mensal `petgestor_monthly` R$ 89,90 (8990 centavos); anual `petgestor_annual` R$ 799,00 (79900 centavos)
- Checkout: browser só envia `plan` (`monthly` \| `annual`); company/amount do body são ignorados; `X-Idempotency-Key` server-side
- Webhook MP: assinatura `x-signature` obrigatória; consulta o provider; registro local por provider id prevalece sobre `external_reference`
- `billing_payments` com UNIQUE `(provider, provider_payment_id)`; evento webhook failed/received pode reprocessar; snapshot antigo não regride `active`
- Cancelamento ao fim do período (`cancel_at_period_end`); acesso residual até `current_period_end` sem badge “ATIVO”
- `BILLING_DEV_BYPASS` continua ignorado em `NODE_ENV=production` mesmo se `true`
- Fail-closed se billing estiver indisponível; `/assinatura` mostra erro recuperável sem loop

**MIGRATION PENDENTE:** `supabase/migrations/20260914150000_bloco9_billing_payments_webhook.sql`

Diagnóstico de legado: `docs/sql/diagnose-bloco-9-billing.sql`

Não reaplica BLOCOs 1–8. Não inicia BLOCO 10.

## [0.50.2] — 2026-09-12

### Corrigido — hardening final do BLOCO 8 (segredo, marker one-time, RPC server-only)

- `AUTH_RECOVERY_SECRET` é o único HMAC de recovery (≥ 32 bytes). Sem fallback para URL pública ou service role; ausência falha fechado
- Marker one-time: cookie opaco + SHA-256 em `private.password_recovery_markers`; `UPDATE … consumed_at IS NULL` atômico; replay recusado
- `consume_auth_rate_limit` deixa de ter `EXECUTE` para `anon`/`authenticated`; o app consome com admin client server-only
- Limpeza oportunística de buckets com `updated_at` há mais de 2 horas

**MIGRATION:** `supabase/migrations/20260912120000_bloco8_recovery_onetime_rate_limit_service_role.sql`

Não edita `20260911400000` nem `20260912090000`. Não inicia BLOCO 9.

## [0.50.1] — 2026-09-12

### Corrigido — hardening residual do BLOCO 8 (rate limit + recovery)

- RPC `consume_auth_rate_limit(p_action, p_bucket_key)`: limit, janela e relógio deixam de vir do caller; política em `private.auth_rate_limit_policy`; `now()` do banco
- Assinatura antiga `(text, integer, integer, timestamptz)` revogada e removida
- Production fail-closed se a RPC estiver ausente/incompatível — Auth não é chamado
- Recovery: ticket HMAC no e-mail + cookie HttpOnly `pg_pwd_recovery` (TTL 15 min); `/nova-senha` e `updateRecoveryPasswordAction` exigem o marcador; sessão normal não basta
- `?next=/nova-senha` sozinho não emite contexto de recovery

**MIGRATION:** `supabase/migrations/20260912090000_bloco8_rate_limit_policy_server_side.sql`

Não edita `20260911400000`. Não inicia BLOCO 9.

## [0.50.0] — 2026-09-11

### Corrigido — Auth, onboarding, convites, uploads e rate limit (BLOCO 8)

- `complete_onboarding` serializa por `auth.uid()` (`pg_advisory_xact_lock`); retry/duplo clique devolvem a mesma `company_id`
- Membership **revogada** não conclui onboarding nem ressuscita acesso; tenant ativo não é escolhido por `created_at LIMIT 1`
- Confirmação de e-mail segue a sessão real do signup; reenvio genérico; callback rejeita `next` externo e `code` ausente
- Recovery: anti-enumeração preservada; erro real do provider vira indisponibilidade temporária
- Lookup público de convite não revela existência/empresa; mensagens de cadastro deixam de enumerar e-mail
- Rate limit persistente (`private.auth_rate_limit_buckets`) para login, cadastro, recovery, reenvio e convites
- Foto do pet: path UUID, magic bytes, thumbnail inválida falha controlada; substituição só apaga a antiga após o UPDATE
- Tutorial/checklist: estado persistido da empresa prevalece sobre `localStorage` antigo
- Validações do escopo em pt-BR; limites UI = Zod; forms não mostram feedback stale durante nova tentativa

**MIGRATION PENDENTE:** `supabase/migrations/20260911400000_bloco8_auth_onboarding_rate_limit.sql`

Diagnóstico de legado: `docs/sql/diagnose-bloco-8-auth-onboarding.sql`

Não reaplica BLOCOs 1–7. Não inicia BLOCO 9 (assinatura/Mercado Pago/trial comercial).

## [0.49.0] — 2026-09-11

### Corrigido — Relatórios, KPIs, ocupação, estoque analítico, pacotes e CSV (BLOCO 7)

- Período analítico half-open `[start, endExclusive)` via `getCivilDateRangeUtcBounds` — inclui 23:59:59.999 e exclui 00:00 do dia seguinte
- PDV operacional: somente `completed` / `partially_paid`; `sale_items` filtrados pela sale pai; ranking por `product_id`
- Movimentos de estoque classificados no enum real (`entry`, `return`, `sale`, `internal_use`, `exit`, `loss`, `adjustment`); tipo desconhecido visível
- Reconciliação auditável por produto contra `current_stock` (divergência de legado sem autofix)
- Pacotes: pending não é recebido; cancelled não é ativo/vendido; expiração por data civil da empresa (`expires_at < hoje`)
- Ocupação em minutos reais: weekdays civis, jornada menos intervalo, duração do snapshot, no-show separado do realizado
- Soft-delete operacional em appointments/customers/pets/employees
- Perdas, vencidos, vence hoje e a vencer (30 dias) na UI de estoque
- CSV acessível nos relatórios, com BOM, headers pt-BR e proteção contra formula injection
- `reports.view` e tenant preservados; financeiro do overview continua em `financial_payments` (BLOCO 5)

Diagnóstico de legado: `docs/sql/diagnose-bloco-7-reports.sql`

Não reaplica BLOCOs 1–6. Não inicia BLOCO 8.

## [0.48.2] — 2026-09-11

### Corrigido — due_date civil da venda PDV (hardening final do BLOCO 6)

- `private.complete_product_sale` grava `financial_entries.due_date` com `private.company_civil_today(v_company_id)`
- `CURRENT_DATE` (sessão/servidor, tipicamente UTC) deixa de decidir o vencimento civil da receita do PDV
- `sold_at`, `paid_at` e `created_at` continuam `timestamptz`

**MIGRATION PENDENTE:** `supabase/migrations/20260911340000_pdv_due_date_company_civil_today.sql`

Não reaplica BLOCOs 1–6. Não inicia BLOCO 7.

## [0.48.1] — 2026-09-11

### Corrigido — hardening incremental do BLOCO 6 (PDV)

- Disponibilidade do PDV usa `availableStock` (saldo − lotes vencidos), não `currentStock` isolado
- Produto com estoque só vencido não é clicável; UI distingue sem estoque, estoque baixo e vencido/indisponível
- Validade do lote usa o dia civil da empresa (`private.company_civil_today`): vence hoje permanece válido; venceu ontem não
- Período do PDV (listagem, métricas, filtros, relatório) é half-open `[start, endExclusive)` — inclui 23:59:59.999 e exclui 00:00 do dia seguinte

**MIGRATION PENDENTE:** `supabase/migrations/20260911320000_stock_expiration_company_civil_today.sql`

Não reaplica BLOCOs 1–6. Não inicia BLOCO 7.

## [0.48.0] — 2026-09-11

### Corrigido — PDV: preço server-side, checkout atômico, estoque e troco (BLOCO 6)

- Preço e total da venda vêm do catálogo no servidor; `unit_price` / `line_total` do cliente são ignorados
- Checkout atômico: sale + items + estoque + `financial_entry` + `financial_payments` na mesma transação
- `idempotency_key` única por empresa com fingerprint do payload — retry não duplica venda, estoque, receita nem caixa
- Estoque concorrente: `FOR UPDATE` + `UPDATE … WHERE current_stock = previous AND new >= 0`
- Pagamentos mistos reconciliam com `financial_payments` (fonte canônica do BLOCO 5)
- `cash_received_cents` é o dinheiro entregue; o payment cash é só o valor aplicado; o troco não é receita
- Caixa aberto é exigido no servidor para recebimento em dinheiro
- Cancelamento de venda paga bloqueado sem política de refund (`sale_paid_requires_refund`)

**MIGRATION PENDENTE:** `supabase/migrations/20260911300000_pdv_server_side_price_checkout.sql`

Diagnóstico de legado: `docs/sql/diagnose-bloco-6-pdv.sql`

Não reaplica BLOCO 1–5. Não inicia BLOCO 7.

## [0.47.1] — 2026-09-11

### Corrigido — criação manual paid atômica (hardening BLOCO 5)

- `createManualEntry` não faz mais INSERT pending + `mark_financial_entry_paid` em duas transações
- RPC `create_manual_financial_entry`: entry + payment canônico + status derivado na mesma transação, ou rollback
- `idempotency_key` da tentativa de criação (única por empresa) — retry não duplica; payload incompatível → `idempotency_key_conflict`
- Preserva BLOCO 1–5. Não inicia BLOCO 6 (PDV)

**MIGRATION PENDENTE:** `supabase/migrations/20260911230000_create_manual_financial_entry_atomic.sql`

## [0.47.0] — 2026-09-11

### Corrigido — Financeiro: pagamentos, recebíveis, períodos e reabertura (BLOCO 5)

- Fonte de verdade do recebido: `SUM(financial_payments)` ativos; saldo = `amount − recebido`
- `partially_paid` entra nos recebíveis só pelo saldo líquido
- Novos lançamentos manuais pagos geram parcela canônica; legado paid sem parcela não é auto-corrigido
- Pagamentos mistos e filtro por método usam `financial_payments` (entry aparece se tiver ao menos um pagamento no método)
- Totais do Financeiro, dashboard e overview usam a mesma matemática
- Período financeiro: intervalo half-open `[from, nextDay)` no fuso da empresa
- Reabertura só em lançamento **manual**, cancelando pagamentos de forma auditável; OS/pacote/PDV bloqueados
- Cancelamento paid/partial bloqueado sem política de refund
- Lock + teto contra overpayment; `idempotency_key` evita duplicar retry
- Pacote `pending → paid` continua ativando o mesmo pacote (BLOCO 4)

**MIGRATION PENDENTE:** `supabase/migrations/20260911220000_financial_payments_source_of_truth.sql`

Diagnóstico de legado: `docs/sql/diagnose-bloco-5-finance.sql`

Não reaplica BLOCO 1, 2, 3 ou 4. Não inicia BLOCO 6 (PDV).

## [0.46.0] — 2026-09-11

### Corrigido — Pacotes: pagamento, saldo, consumo, idempotência e expiração (BLOCO 4)

- Pacote vendido como **pending não é crédito**: não aparece na agenda, não zera preço e não desconta sessão
- Pagamento `pending → paid` ativa o **mesmo** pacote (sem recriar saldo nem `financial_entry`)
- Venda transacional com `idempotency_key` única por empresa — duplo clique, retry e duas abas com a mesma chave geram uma venda
- Preço da venda vem do catálogo no servidor; pacote vendido exige preço > 0
- Consumo idempotente por appointment, com `UPDATE … WHERE remaining > 0`; saldo nunca negativo
- Cancelar appointment devolve exatamente uma sessão; retry não devolve duas; no-show permanece como já definido
- `expires_at` é o último dia civil **inclusivo** no fuso da empresa (`companies.timezone`)
- Cancelar pacote pending cancela a receita pending; pacote **pago** (com ou sem uso) é bloqueado sem política de refund
- Relatórios de pacotes **não** foram alterados neste bloco

**MIGRATION PENDENTE:** `supabase/migrations/20260911200000_customer_service_packages_payment_idempotency.sql`

Diagnóstico de legado: `docs/sql/diagnose-bloco-4-packages.sql`

Não reaplica BLOCO 1, 2 ou 3.

## [0.45.0] — 2026-09-11

### Corrigido — Check-in, OS, máquina de estados e concorrência (BLOCO 3)

- Check-in idempotente de verdade: lock do appointment + `INSERT ON CONFLICT (appointment_id)`; duas abas devolvem a mesma OS
- `unique_violation` não chega à UI
- OS cancelada não é devolvida como ativa; novo check-in falha com erro acionável (sem reabertura automática)
- Cancelar OS `waiting` sincroniza o appointment para `cancelled` na mesma transação
- Transições atômicas `UPDATE … WHERE status` (waiting → in_progress → ready → completed); retry idempotente
- Efeitos (consumos, estoque, receita, notificações, timestamps) só na transição realmente aplicada
- `cancelled_at` em timestamptz UTC; retry não sobrescreve timestamps

**MIGRATION PENDENTE:** `supabase/migrations/20260911180000_service_order_state_machine_concurrency.sql`

Não reaplica BLOCO 1 nem BLOCO 2.

## [0.44.0] — 2026-09-11

### Corrigido — Agenda: data civil, timezone, jornada, recorrência e status (BLOCO 2)

- Data civil `YYYY-MM-DD` deixa de ser formatada como meia-noite UTC no fuso da empresa — `10/10/2026` não vira `09/10/2026`
- Timezone da empresa (`companies.timezone`) é a fonte de verdade da agenda (criar, exibir, filtrar, recorrência)
- Datas civis impossíveis (`2026-02-31`, `2026-04-31`, `2026-02-29` não bissexto) são rejeitadas no schema
- Jornada passa a ter **um intervalo de almoço opcional** por funcionário/dia (`break_start` / `break_end`)
- Agendamento não atravessa o intervalo nem sai da jornada; validação definitiva no banco
- Formulário de agendamento usa campos hidden controlados — UI e FormData não divergem após erro
- Recorrência criada em transação atômica com chave de idempotência; hora civil preservada no DST
- Confirmar / cancelar / no-show passam a `UPDATE ... WHERE status` atômico (sem corrida entre abas)

**MIGRATION PENDENTE:** `supabase/migrations/20260911153000_agenda_civil_date_working_hours_recurrence.sql`

Não reaplica a migration do BLOCO 1 (`20260911120000_authorization_rls_tenant_isolation.sql`).

## [0.43.0] — 2026-09-11

### Corrigido — Autorização, RLS e isolamento multi-tenant (BLOCO 1)

- Membership ativa exige `user_id = auth.uid()` **e** `access_revoked_at IS NULL` em helpers SQL usados por RLS, RPC e Storage
- `loadMembership` falha fechado: membership revogada nunca é promovida a ativa; erro de consulta não vira permissão
- RPCs de mutação deixam de inferir a empresa por `ORDER BY created_at LIMIT 1`; recebem `p_company_id` do contexto ativo
- Policies de mutação passam a exigir permissão granular (`private.has_app_permission`)
- Server Actions de mutação exigem a permissão mínima (`requirePermission`)
- Guard de rota: `x-pathname` é copiado para os **headers da request** para `assertCurrentRoutePermission` validar URL direta
- Storage `company-files`: pasta da empresa + membership ativa + permissão por tipo de path
- Migration incremental: `supabase/migrations/20260911120000_authorization_rls_tenant_isolation.sql`

## [0.42.0] — 2026-09-02

### Corrigido — Agendamento com pacote vendido

- Formulário de novo agendamento lista pacotes **vendidos** ao tutor/pet, ativos, válidos e com sessão do serviço escolhido
- Criar/reagendar registra `customer_package_id` e consome uma sessão (`customer_service_package_usages`) de forma idempotente
- Cancelar devolve o saldo; reagendar o mesmo atendimento não desconta outra sessão
- Se o modelo de pacote existe mas ainda não foi vendido na ficha do pet, o formulário explica isso com CTA
- Agendamento avulso sem pacote permanece inalterado

**MIGRATION PENDENTE:** `supabase/migrations/20260902160000_appointment_package_booking.sql`

## [0.41.0] — 2026-09-01

### Adicionado — Seed da conta demonstrativa completa

- Script `npm run seed:demo` popula o **Pet Shop Amigo Fiel** com dados fictícios em todos os módulos
- Tutores, pets, serviços, equipe, agenda, atendimentos, estoque, pacotes, financeiro, PDV e notificações
- Credenciais padrão e documentação em `docs/DEMO.md`
- Dados centralizados em `src/config/demo-seed-data.ts`

## [0.40.0] — 2026-09-01

### Adicionado — Limpeza de contas demo (painel admin)

- Card em `/admin` para listar e apagar contas de demonstração (ex.: screenshots de marketing)
- Critérios: nome "Pet Shop Amigo Fiel", e-mails de teste ou IDs explícitos em `src/config/demo-accounts.ts`
- Remove empresa (cascade), arquivos do bucket `company-files` e usuários órfãos via service role
- Confirmação obrigatória (`APAGAR DEMO`); contas de platform admin nunca são elegíveis
- SQL manual alternativo: `docs/sql/DELETE-demo-accounts.sql`

## [0.39.0] — 2026-08-25

### Adicionado — Botão flutuante de WhatsApp (site + dashboard)

- Componente `WhatsAppFloatingButton` fixo no canto inferior direito
- Visível nas páginas públicas (layout `(public)`) e no app autenticado (layout `(dashboard)`)
- Desktop: texto + ícone; mobile: só ícone circular
- Link `wa.me` com mensagem pré-preenchida codificada; abre em nova aba (`target="_blank"`)
- Número e mensagem em `src/config/brand.ts` (`supportWhatsApp`)

## [0.38.0] — 2026-08-25

### Adicionado — Onboarding de ativação

- Modal de boas-vindas + checklist “Configure seu PetGestor” no dashboard
- Tutorial guiado com spotlight em CTAs reais (serviço, funcionário, tutor/pet, agenda)
- Detecção automática de etapas a partir dos dados da empresa
- Guia visual do fluxo de atendimento + intro financeira (educativos)
- Persistência `onboarding_progress` (multi-tenant + RLS) com fallback legado/`localStorage`
- Ajuda em Configurações: refazer tutorial + WhatsApp suporte
- Eventos Meta: onboarding_started/skipped/completed e marcos de ativação

### Migration

- `20260825200000_onboarding_progress.sql` (**aplicar no Supabase**)
- Atalho: `docs/sql/APPLY-onboarding-progress.sql`

## [0.37.0] — 2026-08-25

### Adicionado — Meta Pixel

- Loader central no root layout (`MetaPixelRoot`)
- Env `NEXT_PUBLIC_META_PIXEL_ID` (produção) + `NEXT_PUBLIC_META_PIXEL_DEBUG` (dev opcional)
- Eventos: PageView, SignupStarted, CompleteRegistration, StartTrial, InitiateCheckout
- Sem Purchase no browser (webhook/CAPI futuro)
- Docs: `docs/META_PIXEL.md`

## [0.36.0] — 2026-08-25

### Finalizado — Insumos de serviço → consumo no atendimento → estoque

- Receita do serviço (`service_product_recipes`): UI em criar/editar serviço
- Linhas de consumo no atendimento (`service_order_consumptions`): ajustar qty, adicionar, remover
- Baixa automática ao **marcar como pronto** (`mark_service_order_ready`) via `register_stock_movement` (`internal_use` / `service_consumption`)
- Idempotência por chave determinística; FEFO/lotes; bloqueio de estoque insuficiente com detalhe
- Custo gerencial de insumos (visível com `inventory.view`); não altera preço do cliente
- Notificação de estoque baixo/zerado após a baixa
- Sem conversão automática ml↔litro (quantidade na unidade do produto)
- Sem reabertura de OS; cancelamento só em `waiting` (antes do consumo)

### Migration

- `20260825170000_service_order_stock_consumption.sql` (**aplicar no Supabase**)
- Atalho: `docs/sql/APPLY-service-order-stock-consumption.sql`

## [0.35.0] — 2026-08-25

### Finalizado — PDV (saldo, pagamento adicional, caixa)

- Detalhe da venda: Total / Pago / Saldo pendente e status claro
- RPC `register_sale_payment` para receber saldo de venda parcialmente paga (sem duplicar receita)
- Sessão de caixa (`cash_sessions`): abrir → operar → fechar em `/dashboard/pdv/caixa`
- Fechamento por forma de pagamento; só dinheiro físico entra no gaveteiro
- Pagamentos do período contabilizados por `paid_at` (parcial em dias diferentes não duplica)
- Permissões: `pos.receive_payment`, `pos.close_cash` (além de `pos.use` / `pos.cancel_sale`)
- Cancelamento total com devolução de estoque e cancelamento financeiro interno (já existente; UI gated por permissão)
- Devolução parcial de itens **não** incluída (adiada por risco)

### Migration

- `20260825160000_pdv_finalize.sql` (**aplicar no Supabase**)
- Atalho: `docs/sql/APPLY-pdv-finalize.sql`

## [0.34.0] — 2026-08-25

### Adicionado — Busca global no header

- Campo “Buscar no PetGestor…” (desktop + painel mobile)
- Server-side com permissões e `company_id` do contexto autenticado
- Grupos: clientes, pets, agenda, atendimentos, funcionários, serviços, produtos, vendas, pacotes
- Debounce 300ms, mínimo 2 caracteres, máx. 5 resultados/categoria + “Ver todos”
- Ranking simples (exact → prefix → contains), telefone sem máscara, fold de acentos no ranking
- Atalho Ctrl/Cmd+K
- Índices `pg_trgm` para ILIKE

### Migration

- `20260825150000_global_search_indexes.sql` (**aplicar no Supabase**)
- Atalho: `docs/sql/APPLY-global-search-indexes.sql`

## [0.33.0] — 2026-08-25

### Adicionado — Central de notificações (sino)

- Tabela `app_notifications` com RLS multi-tenant e dedupe por `(company_id, dedupe_key)`
- Sino no header: painel, contador de não lidas, marcar lida / todas, deep links
- Página `/notificacoes` com filtros todas / não lidas / lidas
- Eventos: atendimento pronto, estoque baixo/zerado, agendamento atribuído/próximo, pagamento pendente/vencido, pacote a vencer, convite de funcionário
- Filtragem por permissão (ex.: sem `finance.view` não vê financeiro)
- Sem WhatsApp / push / e-mail nesta etapa

### Migration

- `20260825140000_app_notifications.sql` (**aplicar no Supabase**)
- Atalho: `docs/sql/APPLY-app-notifications.sql`

## [0.32.2] — 2026-08-25

### Corrigido — Links de e-mail Auth apontavam para localhost

- Causa: `getSiteUrl()` lia só `NEXT_PUBLIC_APP_URL` e caía em `localhost:3000`, ignorando `APP_URL`
- Resolução central em `src/lib/env/resolve-app-url.ts`: `APP_URL` → `NEXT_PUBLIC_APP_URL` → `VERCEL_URL` → headers → localhost **só fora de production**
- Convite de funcionário, confirmação de conta e recuperação de senha usam a mesma URL

## [0.32.1] — 2026-08-25

### Adicionado — Botão Sair mais visível

- “Sair” sempre no header do dashboard (também no mobile)
- “Sair da conta” em Configurações
- “Sair da conta” no onboarding e no fluxo de convite

## [0.32.0] — 2026-08-25

### Alterado — Trial gratuito de 7 dias

- `TRIAL_DURATION_DAYS = 7` / `TRIAL_DURATION_HOURS = 168` em `src/config/subscription.ts`
- Trigger `private.create_company_subscription()` cria novos trials com `now() + interval '7 days'`
- Textos de marketing/landing/admin atualizados para “7 dias”
- **Não** estende trials já existentes (ativos, expirados ou assinantes)

### Migration

- `20260825120000_trial_7_days.sql` (**aplicar no Supabase**)
- Atalho: `docs/sql/APPLY-trial-7-days.sql`

## [0.31.0] — 2026-08-24

### Adicionado — Plano anual R$ 799 (Mercado Pago)

- Mantém mensal R$ 89,90; adiciona anual R$ 799/ano (equivalente R$ 66,58/mês; economia R$ 279,80)
- Preapproval MP: mensal `frequency: 1`; anual `frequency: 12` months × R$ 799
- `billing_interval` + `offer_code` (`annual_launch_799`) — oferta de lançamento sem countdown falso
- Checkout só após trial; ativação só via webhook/sync; preço só no servidor
- UI assinante (cards mensal/anual), admin (plano/valor) e landing (#preços)
- Cancelar renovação preserva acesso até `current_period_end` quando já pago
- Troca **mensal→anual** na área do assinante (cancela renovação mensal; anual só após pagamento)
- Troca **anual→mensal** imediata: bloqueada (só após fim do período / cancelar renovação)
- UI `/assinatura` simplificada: plano, valor, vencimento, mudar plano, cancelar renovação

### Migration

- `20260824200000_annual_subscription_plan.sql` (**aplicar no Supabase**)

## [0.30.0] — 2026-08-21

### Adicionado — Funcionário sem cobrança + admin sempre ativo

- Funcionários **não pagam**: acesso enquanto a assinatura/trial da empresa estiver ativa
- Sem assinatura da empresa, staff vai para `/assinatura-equipe` (sem checkout Mercado Pago)
- Só `subscription.manage` (dono/gestor) acessa `/assinatura` e ações de cobrança
- Banner de trial só para quem gerencia assinatura
- `companies.billing_exempt` + assinatura `active` permanente para conta admin da plataforma

### Migration

- `20260821200000_billing_exempt_platform_admin.sql` (**aplicar no Supabase**)

## [0.29.4] — 2026-08-21

### Operação — SQL único para destravar convite

- Script `docs/sql/FIX-CONVITE-AGORA.sql`: instala funções de convite + reabre convite pendente para `genyvitalflexpddro@gmail.com`
- Cadastro de funcionário diferencia “RPC ausente no banco” de “convite realmente inexistente”

## [0.29.3] — 2026-08-21

### Corrigido — Convite “não encontrado” após Dar acesso

- `grant_employee_access` **não auto-vincula** mais usuários Auth sem e-mail confirmado (criados pelo `inviteUserByEmail`)
- Reenvio reabre convite pendente e limpa vínculo prematuro de staff não confirmado
- Após conceder acesso, o dono vê **link de convite copiável** (WhatsApp) se o Gmail não entregar
- Mensagens do cadastro de funcionário orientam Entrar / Recuperar senha / link do admin

### Migration

- `20260821190000_grant_skip_unconfirmed_users.sql` (**aplicar no Supabase**)
- Diagnóstico: `docs/sql/diagnose-employee-invite.sql`

## [0.29.2] — 2026-08-21

### Adicionado — E-mail automático ao conceder acesso

- Ao clicar em **Dar acesso ao PetGestor**, o sistema envia o convite por e-mail (Supabase Auth `inviteUserByEmail`)
- Redirect do link para `/auth/confirm?next=/convite`
- Reenvio: se a conta Auth ainda não confirmou, apaga e reenvia o convite
- Mensagens honestas quando falta `SUPABASE_SERVICE_ROLE_KEY` ou o envio falha (convite da empresa continua criado)
- Fluxo `/cadastro` → “Sou funcionário” permanece como alternativa

## [0.29.1] — 2026-08-21

### Adicionado — Escolha inicial no cadastro (dono vs funcionário)

- Tela “Como você vai usar o PetGestor?” com dois cards
- Fluxo funcionário: e-mail → lookup seguro de convite → criar conta
- RPC `lookup_pending_invite_by_email` (só nome da empresa + perfil; sem company_id)
- Mensagens claras quando não há convite
- Owner permanece no fluxo atual de criação de empresa

### Migration

- `20260821150000_lookup_pending_invite_by_email.sql`

## [0.29.0] — 2026-08-21

### Adicionado — Fluxo completo de convite e login de funcionários

- Cadastro dedicado de funcionário (`/cadastro?modo=funcionario`) sem criar empresa
- Tela `/convite` com “Você foi convidado” + botão Aceitar
- RPC `peek_pending_invite` e hardening de `accept_pending_invite` / `grant_employee_access`
- Status claros na ficha: Ativo / Pendente / Expirado / Removido / Sem acesso
- Mensagem honesta: envio automático de e-mail ainda não configurado
- Proteção contra sobrescrever vínculo employee↔user de outra conta
- Onboarding de owner permanece separado do fluxo staff

### Migration

- `20260821140000_invite_flow_hardening.sql` (aplicar no Supabase)

## [0.28.0] — 2026-08-19

### Adicionado — Relatórios gerenciais avançados

- Visão geral com KPIs: faturamento, receita, despesas, resultado, atendimentos, ticket médio, PDV, novos clientes, cancelamentos
- Comparação com período anterior (↑ crescimento / ↓ queda)
- Relatório de atendimentos: total, concluídos, cancelados, faltas, ticket médio, evolução diária
- Serviços mais realizados: ranking com contagem, receita e percentual
- Relatório de clientes: ativos, novos, recorrentes, inativos, top por gasto/visitas
- Taxa de retorno com explicação documentada
- Relatório de pets: atendidos, por espécie, top por visitas
- Desempenho da equipe: atendimentos, faturamento, média/dia por funcionário
- Taxa de ocupação: slots disponíveis vs utilizados, por dia da semana
- Horários mais movimentados: distribuição por faixa horária
- Dias da semana: gráfico de movimento por dia
- Cancelamentos e faltas: evolução e clientes recorrentes
- PDV: total vendido, ticket médio, lucro bruto, produtos mais vendidos
- Estoque: valor estimado, baixo estoque, perdas, vencimentos próximos
- Pacotes: vendidos, ativos, créditos restantes
- Financeiro: link para análise completa (sem duplicar dashboard)
- Exportar CSV nos relatórios principais
- Filtro global: hoje, 7 dias, mês, mês anterior, 30 dias, ano, personalizado
- Gráficos SVG inline (linha, barras) — sem biblioteca externa
- Mobile-first: cards empilhados, accordions
- Permissões: `reports.view` obrigatório + `finance.view` para dados sensíveis
- Motor de cálculo puro (engine.ts) + queries server-side
- Sem migration necessária

## [0.27.0] — 2026-08-18

### Adicionado — Permissões por funcionário

- Perfis: Dono/Admin, Gerente, Recepção, Operacional, Financeiro, Estoque/Caixa
- Permissões granulares por módulo/ação em `company_members.permissions`
- Vínculo funcionário ↔ usuário (`employees.user_id`, `company_members.employee_id`)
- Painel "Acesso ao sistema" na ficha do funcionário
- Sidebar dinâmica, proteção de rotas e validação server-side (`requirePermission`)
- Opção "Ver somente meus atendimentos" para perfis operacionais
- Convites pendentes por e-mail (base — envio transacional pendente)
- RLS reforçada em `financial_entries`

**MIGRATION PENDENTE:** `supabase/migrations/20260818180000_employee_permissions.sql`

### Corrigido — Fluxo de funcionário convidado

- Convite pendente é aceito automaticamente ao criar conta ou fazer login
- Funcionário convidado NÃO cria nova empresa
- Onboarding "Configure seu pet shop" é pulado para quem tem convite
- Banner "Bem-vindo(a) à [empresa]!" no dashboard após convite aceito
- Convite expirado/cancelado ou funcionário arquivado não concede acesso
- Idempotente: login repetido não duplica membership
- Multiempresa: não apaga membership existente

**MIGRATION PENDENTE:** `supabase/migrations/20260819120000_accept_invite_flow.sql`

### Corrigido — Dashboard com dados reais

- Removidos avisos enganosos de "dados demonstrativos" no app autenticado
- Lista "Tutores recentes" passa a usar cadastros reais do Supabase
- Resumo financeiro e agenda não derrubam o dashboard quando um módulo falha
- Alerta de erro só aparece quando falham dados principais (tutores, pets, agenda)

## [0.26.0] — 2026-08-18

### Adicionado — Dashboard financeiro visual

- KPIs: receita recebida, despesas pagas, resultado líquido e margem
- Gráficos: origem das receitas, destino das despesas, evolução financeira
- Faturado x recebido x pendente (com pagamentos parciais via `financial_payments`)
- Rankings de fontes de receita e maiores despesas
- Lucro bruto do PDV quando há custo snapshot
- Drill-down por origem/categoria na listagem de lançamentos
- Filtros de período: hoje, 7 dias, mês, mês anterior, 30 dias, personalizado

## [0.25.0] — 2026-08-18

### Adicionado — Fotos e anexos (pets e atendimentos)

- Foto principal do pet com placeholder/avatar
- Anexos do pet (imagens e PDF) por categoria
- Fotos/anexos por atendimento com antes/depois
- Galeria do pet com paginação
- Bucket privado `company-files` + signed URLs
- Indicador de anexos no histórico do pet

**MIGRATION PENDENTE:** `supabase/migrations/20260818160000_pet_service_attachments.sql`

## [0.24.0] — 2026-08-18

### Adicionado — PDV / venda de produtos

- Tela mobile-first em `/dashboard/pdv` com carrinho, desconto e pagamento dividido
- Histórico e detalhe em `/dashboard/pdv/vendas`
- RPCs `complete_product_sale` e `cancel_product_sale` (transação atômica)
- Tabelas `sales`, `sale_items`, `financial_payments`; status `partially_paid` no financeiro
- Baixa de estoque tipo `sale`, snapshot de custo, recibo com impressão/PDF via navegador
- Card de vendas do dia no dashboard

**MIGRATION PENDENTE:** `supabase/migrations/20260818140000_point_of_sale.sql`

Sem emissão fiscal, TEF ou leitor de código de barras físico.

## [0.23.0] — 2026-08-18

### Adicionado — Estoque (produtos, lotes e movimentações)

- Cadastro de produtos, categorias e fornecedores por empresa
- Entrada, saída manual e ajuste com histórico imutável
- Estoque mínimo, custo médio ponderado, lotes e alerta de validade
- RPC transacional `register_stock_movement` (saldo atômico, idempotência, sem saldo negativo)
- Card compacto de alertas no dashboard
- Tabela `service_product_recipes` apenas como preparação futura (sem baixa automática)

**MIGRATION PENDENTE:** `supabase/migrations/20260818120000_inventory.sql`

Sem PDV, NFC-e ou integração de despesa na entrada nesta etapa.

## [0.22.0] — 2026-08-17

### Adicionado — WhatsApp Cloud API (fila de lembretes)

- Provider isolado (`src/lib/whatsapp/`) usando Graph API oficial da Meta (mensagens tipo `template`)
- Worker com claim `FOR UPDATE SKIP LOCKED`, retries com backoff e janela de tolerância
- Cron Vercel `/api/cron/whatsapp-notifications` e webhook `/api/webhooks/whatsapp`
- Histórico: Pendente, Processando, Enviada, Entregue, Lida, Falhou, Cancelada
- Modo `WHATSAPP_SEND_ENABLED=false` (simulação, sem marcar entregue)
- Teste interno no painel `/admin` (número autorizado no servidor)

**MIGRATION PENDENTE:** `supabase/migrations/20260817200000_whatsapp_notification_delivery.sql`

Código pronto; integração aguardando configuração da conta Meta/templates/credenciais.

## [0.21.0] — 2026-08-17

### Adicionado — Lembretes internos para tutor e funcionário

- Reutiliza `notification_queue` e `company_notification_settings` (sem WhatsApp ainda)
- Lembrete do dia (horário configurável, padrão 08:00 no timezone da empresa)
- Lembretes 2h e do dia também para a equipe, usando `employees.phone`
- Destinatário `customer` / `employee` na fila e no histórico
- Falta (`no_show`) cancela lembretes futuros; `getDueNotifications()` preparado para o worker
- Templates internos atualizados; pet pronto continua idempotente por `service_order_id`

**MIGRATION PENDENTE:** `supabase/migrations/20260817193000_customer_employee_reminders.sql`

## [0.20.0] — 2026-08-17

### Adicionado — Agenda mais rápida + lista de espera

- Criação rápida na agenda (clique em slot ou botão) via sheet sem sair da página
- Painel rápido do agendamento: confirmar, cancelar, falta, check-in, duplicar, editar
- Lista de espera (`appointment_waitlist`) com conversão em agendamento
- Aviso interno ao cancelar quando há clientes compatíveis na lista de espera
- Bloqueios pontuais de horário (`schedule_time_blocks`) integrados a slots e RPCs

**MIGRATION PENDENTE:** `supabase/migrations/20260817180000_agenda_waitlist_time_blocks.sql`

## [0.19.0] — 2026-08-17

### Adicionado — Histórico completo do pet

- Timeline operacional na ficha do pet (agendamentos, atendimentos, financeiro, pacotes, cancelamentos/faltas)
- Cards de resumo: último atendimento, próximo agendamento, totais, gasto e serviço mais realizado
- Painel destacado "Informações importantes" (alergias + cuidados/comportamento)
- Coluna `pets.important_notes` para cuidados operacionais
- Paginação "Carregar mais" sem duplicar tabelas de histórico

**MIGRATION PENDENTE:** `supabase/migrations/20260817160000_pet_important_notes.sql`

## [0.18.0] — 2026-08-17

### Adicionado — Pacotes de serviços

- Catálogo de pacotes (`service_packages` + itens) em Serviços → Pacotes
- Venda de pacote na ficha do pet com receita financeira (`source_type: service_package`)
- Consumo explícito via "Usar pacote" no atendimento (não automático)
- Estorno controlado, saldo por serviço, validade e status (ativo/expirado/utilizado/cancelado)
- `mark_service_order_ready` não gera receita avulsa quando preço = 0 (coberto por pacote)

**MIGRATION PENDENTE:** `supabase/migrations/20260817140000_service_packages.sql`

## [0.17.0] — 2026-08-17

### Adicionado — Fila interna de confirmações e lembretes

- Tabelas `company_notification_settings` e `notification_queue` (sem envio externo ainda)
- Confirmação ao criar, lembretes 24h/2h, aviso pet pronto — respeitando timezone da empresa
- Toggles em Configurações · histórico simples de mensagens geradas
- Telefone do tutor reutiliza `customers.phone` (E.164 na fila)
- Idempotência via índices únicos parciais; cancelamento preserva histórico

**MIGRATION PENDENTE:** `supabase/migrations/20260817120000_appointment_notifications.sql`

## [0.16.1] — 2026-08-15

### Corrigido — Assinatura dentro do app autenticado

- `/assinatura` e `/assinatura/retorno` movidas para o layout do dashboard (sidebar/header)
- Gate operacional isolado em `/dashboard/*` (sem loop e sem “logout” visual)
- Sessão preservada ao abrir Assinatura; trial expirado continua podendo regularizar

## [0.16.0] — 2026-08-15

### Adicionado — Recorrência de agendamentos (etapa 1)

- Tabela `appointment_recurrences` + `appointments.recurrence_id` / `recurrence_index`
- Frequências: semanal, quinzenal, mensal, personalizado em dias
- Término por quantidade (máx. 52) ou data — sem recorrência infinita
- Conflitos: cada ocorrência passa por `create_appointment`; falhas são reportadas
- Edição/cancelamento: somente este · este e os próximos
- Badge “Recorrente” na agenda e no detalhe

**MIGRATION PENDENTE:** `supabase/migrations/20260815020000_appointment_recurrences.sql`

## [0.15.1] — 2026-08-14

### Corrigido — Loop de redirects no dashboard

- Select de `profiles` com fallback se `onboarding_tutorial_completed_at` ainda não existir no banco
- Evita loop Safari `/dashboard` ↔ `/onboarding` quando a migration do tutorial não foi aplicada

## [0.15.0] — 2026-08-14

### Adicionado — Tutorial inicial guiado

- Tour de 8 etapas no dashboard após onboarding da empresa
- Estado em `profiles.onboarding_tutorial_completed_at` (por usuário)
- Pular/concluir marca no servidor via RPC `complete_onboarding_tutorial` (`auth.uid()`)
- Contas existentes pré-marcadas na migration (não interrompe quem já usa)
- “Ver tutorial novamente” em Configurações (sem resetar o status)
- Mobile: card inferior legível (spotlight do menu no desktop)

**MIGRATION PENDENTE:** `supabase/migrations/20260814210000_onboarding_tutorial.sql`

## [0.14.0] — 2026-08-13

### Adicionado — Telefone no cadastro e área do assinante

- Campo obrigatório **Telefone / WhatsApp** no cadastro/onboarding (validação BR + E.164)
- Migration `profiles.phone` (NULL permitido para contas antigas) + `complete_onboarding(..., p_phone)`
- Telefone do responsável na listagem/detalhe do painel admin + link WhatsApp (`wa.me`)
- Área do assinante em `/assinatura`: plano, status, trial, cobranças, acesso, regularização e cancelamento
- Forma de pagamento: texto seguro (sem dados sensíveis do Mercado Pago)

### Não incluído

- Troca de plano, cupons, reembolso, NF, carteira interna

**MIGRATION PENDENTE:** `supabase/migrations/20260813200000_profile_phone.sql`

## [0.13.0] — 2026-08-13

### Adicionado — Painel administrativo interno

- Tabela `platform_admins` com RLS (SELECT próprio; sem INSERT/UPDATE/DELETE para clientes)
- Gate server-side `requirePlatformAdmin()` → 404 para não-admins
- Rotas `/admin` e `/admin/[companyId]` (somente visualização)
- Cards: total, trial, ativas, inadimplentes, canceladas, bloqueadas, MRR estimado
- Menu "Admin" apenas para platform admin
- Queries cross-tenant via `service_role` apenas após gate server-side

### Não incluído

- Edição/cancelamento/impersonação/cobrança manual pelo painel

**MIGRATION PENDENTE:** `supabase/migrations/20260813190000_platform_admins.sql`

## [0.12.0] — 2026-08-06


### Adicionado — Mercado Pago e assinatura real (Etapa 10B)

- Migration billing: campos provider, `billing_webhook_events`
- Integração Mercado Pago Subscriptions (preapproval pending, sem plano)
- Checkout hospedado via `init_point` — PetGestor não coleta cartão
- Webhook `POST /api/webhooks/mercado-pago` com validação `x-signature`
- Actions: checkout, refresh, cancelamento
- Rotas: `/assinatura`, `/assinatura/retorno`
- Admin Supabase (`service_role`) restrito a billing/webhook
- Documentação: `docs/MERCADO_PAGO_SETUP.md`, `docs/MERCADO_PAGO_TEST_PLAN.md`

### Regras preservadas

- Trial 72h local sem MP; checkout bloqueado antes de expirar
- Nenhuma cobrança automática ao fim do trial
- R$ 89,90/mês; sem `free_trial` no Mercado Pago

**MIGRATION PENDENTE:** `supabase/migrations/20260806084500_mercado_pago_billing.sql`

## [0.11.0] — 2026-08-06

### Adicionado — Trial 72h e controle de acesso (Etapa 10A)

- Migration `company_subscriptions` com trial exato de 72 horas
- Trigger automático ao criar empresa + backfill seguro
- Feature `src/features/subscription/` — entitlement, queries, banner, tela de assinatura
- Gate central: layout dashboard + `requireCompanyContext()`
- Rota `/assinatura` acessível com trial expirado
- Config: `TRIAL_DURATION_HOURS=72`, `PLAN_MONTHLY_PRICE_CENTS=8990`
- Documentação: `docs/SUBSCRIPTIONS.md`, `docs/TRIAL_TEST_PLAN.md`
- Testes: entitlement, utils, config

### Não incluído

- Mercado Pago, checkout, cartão, Pix, boleto, webhooks, cobrança automática

**MIGRATION PENDENTE:** `supabase/migrations/20260806083000_subscriptions_trial.sql`

## [0.10.0] — 2026-08-06

### Adicionado — Financeiro operacional (Etapa 9)

- Migration `financial_entries` com RLS, constraints, índices e RPCs financeiras
- Atualização transacional de `mark_service_order_ready` — gera receita pending com snapshot
- Feature `src/features/finance/` — actions, queries, schemas, componentes
- Páginas: `/dashboard/financeiro`, nova receita, nova despesa, detalhe
- Integração financeira em atendimentos e dashboard com métricas reais
- Documentação: `docs/FINANCE.md`, `docs/FINANCE_TEST_PLAN.md`
- Testes: status, schemas, utils (cálculos, moeda, filtros)

### Não incluído

- NF, boleto, Pix automático, conciliação, DRE contábil, comissão, estoque, assinatura SaaS, trial

**MIGRATION PENDENTE:** `supabase/migrations/20260806081500_finance.sql`

## [0.9.0] — 2026-08-06

### Adicionado — Atendimentos / Ordens de Serviço (Etapa 8)

- Migration `service_orders` com RLS, FK composta e RPCs transacionais
- Fluxo: check-in → aguardando → em atendimento → pronto → entregue
- Sincronização atômica com status de `appointments`
- Feature `src/features/service-orders/` — actions, queries, schemas, componentes
- Páginas: `/dashboard/atendimentos`, `/dashboard/atendimentos/[id]`
- Check-in na agenda (`Pet chegou`)
- Dashboard: métricas Aguardando, Em atendimento, Prontos para buscar
- Documentação: `docs/SERVICE_ORDERS.md`, `docs/SERVICE_ORDERS_TEST_PLAN.md`
- Testes: status, schemas, utils

### Não incluído

- Pagamento, financeiro, estoque, comissões, NF, WhatsApp, IA

**MIGRATION PENDENTE:** `supabase/migrations/20260806080000_service_orders.sql`

## [0.8.1] — 2026-08-06

### Alterado — Período de teste gratuito

- Teste gratuito padronizado para **3 dias** (antes 7 dias) em landing, marketing e documentação
- Constante futura `TRIAL_DURATION_DAYS = 3` em `src/config/subscription.ts`
- Requisitos documentados para implementação futura de assinatura (sem cobrança nesta etapa)

## [0.8.0] — 2026-08-06

### Adicionado — Agenda (Etapa 7)

- Migration `appointments` com timezone em `companies`, EXCLUDE de conflitos, RLS e RPCs
- RPC: `create_appointment`, `update_appointment` (snapshots, jornada, conflitos)
- Feature `src/features/appointments/` — actions, queries, schemas, status, componentes
- Páginas: `/dashboard/agenda` (dia/semana, filtros), novo, detalhe, editar
- Dashboard: métrica real "Agendamentos hoje", listas de hoje e próximos atendimentos
- Timezone: `src/lib/timezone.ts`
- Documentação: `docs/APPOINTMENTS.md`, `docs/APPOINTMENTS_TEST_PLAN.md`
- Testes: schemas, status, utils, timezone

### Não incluído

- Ordem de serviço, pagamento, financeiro, estoque, comissão, WhatsApp, atendimento completo

**MIGRATION PENDENTE:** `supabase/migrations/20260806073000_appointments.sql`

## [0.7.0] — 2026-08-06

### Adicionado — Funcionários (Etapa 6)

- Migration `employees`, `employee_services`, `employee_working_hours` com FK composta e RLS
- RPC transacionais: `create_employee_with_schedule`, `update_employee_with_schedule`
- Feature `src/features/employees/` — CRUD, serviços vinculados, horários semanais
- Páginas: `/dashboard/funcionarios` (lista, busca, filtros), novo, detalhe, editar
- Navegação: item "Funcionários" no dashboard
- Métrica "Funcionários ativos" no dashboard
- Documentação: `docs/EMPLOYEES.md`, `docs/EMPLOYEES_TEST_PLAN.md`
- Testes: schemas e utils de funcionários

### Não incluído

- Agenda, agendamentos, comissões, folha, ponto, login de funcionário, convites, financeiro

**MIGRATION PENDENTE:** `supabase/migrations/20260806071500_employees.sql`

## [0.6.0] — 2026-08-05

### Adicionado — Serviços (Etapa 5)

- Migration `services` + `service_size_prices` com FK composta e RLS
- RPC transacionais: `create_service_with_prices`, `update_service_with_prices`
- Preços em centavos (`src/lib/money.ts`) — fixed e by_size (4 portes)
- Feature `src/features/services/` — actions, queries, schemas, componentes
- Páginas: `/dashboard/servicos` (lista, busca, filtro, paginação), novo, detalhe, editar
- Ativar/desativar, arquivar (soft delete), métrica "Serviços ativos" no dashboard
- Documentação: `docs/SERVICES.md`, `docs/SERVICES_TEST_PLAN.md`
- Testes: moeda BRL, schemas, utils de serviços

### Não incluído

- Agenda, agendamento, funcionários, comissões, atendimento, financeiro, pagamentos

**MIGRATION PENDENTE:** `supabase/migrations/20260805210000_services.sql`

## [0.5.1] — 2026-08-05

### Auditoria de segurança (isolamento multi-tenant)

- Defense-in-depth: validação UUID, helpers `didMutateAccessibleRow` / `shouldTreatAsNotFound`
- Server Actions de tutores e pets: zero rows → mensagem genérica (sem vazar tenant)
- Rota dev `/api/dev/security-context` (somente development)
- Documentação: `docs/TENANT_ISOLATION_AUDIT.md`, `docs/RLS_AUDIT.sql`
- Atualização: `docs/SECURITY.md`, `docs/RLS_TEST_PLAN.md`
- Testes: `src/lib/security/uuid.test.ts`, `src/lib/security/tenant-access.test.ts`

### Não incluído

- Novas funcionalidades de negócio (agenda, serviços, financeiro, etc.)
- service_role na aplicação

## [0.5.0] — 2026-08-05

### Adicionado

- CRUD de tutores (`customers`) e pets com multi-tenancy e RLS
- Migration `customers` + `pets` com FK composta e soft delete
- Páginas: `/dashboard/tutores`, `/dashboard/pets` e sub-rotas completas
- Server Actions, schemas Zod, consultas paginadas e busca server-side
- Helpers de telefone brasileiro (`src/lib/phone.ts`)
- Métricas reais no dashboard: tutores e pets cadastrados
- Documentação: `docs/CUSTOMERS_PETS.md`, `docs/CUSTOMERS_PETS_TEST_PLAN.md`
- 16 testes unitários adicionais (schemas, telefone, paginação)

### Não incluído

- Agenda, serviços, atendimentos, financeiro, estoque, upload de foto, assinatura

## [0.4.0] — 2026-08-05

### Adicionado

- Autenticação real: cadastro, login, logout, recuperação e alteração de senha
- Confirmação de e-mail SSR (`/auth/confirm` com `verifyOtp` + token_hash)
- Callback PKCE (`/auth/callback` com `exchangeCodeForSession`)
- Onboarding multi-tenant (`/onboarding` + RPC `complete_onboarding`)
- Proxy de sessão Next.js 16 (`src/proxy.ts` + `getClaims()`)
- Proteção server-side do dashboard com membership via RLS
- Migration SQL multi-tenant: `profiles`, `companies`, `company_members`, RLS e helpers
- Schemas Zod reutilizáveis e Server Actions em `src/features/auth/`
- Páginas: `/verifique-email`, `/recuperar-senha`, `/nova-senha`, `/auth/erro`
- Perfil em `/dashboard/configuracoes` com dados reais e alteração de senha
- Tipos reais em `src/types/database.types.ts`
- Testes unitários de schemas, safe redirect e helpers
- Documentação: `docs/AUTH.md`, `docs/RLS_TEST_PLAN.md`

### Não incluído

- Tutores, pets, serviços, agenda, ordens de serviço, financeiro, estoque
- Convites de funcionários, assinatura, Mercado Pago, Stripe, WhatsApp, IA
- Service role, SMTP próprio, rate limiting dedicado

## [0.3.0] — 2026-08-05

### Adicionado

- Integração inicial com Supabase via `@supabase/supabase-js` e `@supabase/ssr`
- Validação tipada de variáveis públicas em `src/lib/env/public-env.ts`
- Cliente browser (`src/lib/supabase/client.ts`) com `createBrowserClient`
- Cliente server (`src/lib/supabase/server.ts`) com `createServerClient` e cookies do Next.js 16
- Verificação segura de conexão em `src/lib/supabase/connection-check.ts`
- Rota de diagnóstico temporária `GET /api/dev/supabase-health` (somente desenvolvimento)
- Placeholder de tipos do banco em `src/types/database.types.ts`
- Testes unitários para validação de env e configuração Supabase
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no `.env.example`

### Não incluído

- Autenticação funcional, middleware de sessão, tabelas de negócio, RLS, secret keys

## [0.2.0] — 2026-08-05

### Adicionado

- Identidade visual temporária com paleta esmeralda e tipografia Plus Jakarta Sans
- Landing page completa: hero, benefícios, como funciona, preços e CTA final
- Prévia visual do dashboard na página inicial
- Componentes de marketing, autenticação demonstrativa e dashboard refinados
- `ButtonLink` para navegação acessível sem warnings do Base UI
- Dados demonstrativos expandidos (agenda, financeiro, clientes recentes)
- Menu responsivo no cabeçalho público

### Corrigido

- 10 issues do indicador Next.js causados por `Button` + `Link` com semântica incorreta
- Hierarquia visual, espaçamentos, contraste e responsividade geral

### Não incluído

- Supabase, autenticação real, banco de dados e funcionalidades de negócio

## [0.1.0] — 2026-07-31

### Adicionado

- Fundação do projeto PetGestor com Next.js, TypeScript, Tailwind e shadcn/ui
- Página pública inicial com CTAs provisórios
- Páginas provisórias `/entrar`, `/cadastro` e `/dashboard`
- Layout responsivo do dashboard com sidebar e menu mobile
- Componentes de estado (loading, empty, error, not-found)
- Configuração centralizada de marca em `src/config/brand.ts`
- Regras permanentes do Cursor em `.cursor/rules/`
- Documentação inicial em `docs/`
- Vitest, ESLint, Prettier e scripts de validação
- `.env.example` preparado para Supabase (próxima etapa)

### Não incluído

- Supabase, autenticação, banco de dados e funcionalidades de negócio
