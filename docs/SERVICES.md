# PetGestor — Serviços (Etapa 5)

## Visão geral

Módulo de cadastro de serviços do pet shop: banho, tosa, hidratação, etc.

Cada serviço pertence a **uma empresa** (`company_id`) e respeita RLS + defense-in-depth na aplicação.

## Modelo de dados

### `public.services`

| Campo | Descrição |
|-------|-----------|
| `pricing_mode` | `fixed` ou `by_size` |
| `price_cents` | Preço fixo em centavos (NULL quando `by_size`) |
| `duration_minutes` | Duração fixa ou **fallback mínimo** quando `by_size` |
| `active` | Disponível para novos agendamentos futuros |
| `deleted_at` | Soft delete (arquivamento) |

### `public.service_size_prices`

Preços e durações por porte quando `pricing_mode = by_size`:

| Porte (`size`) | Label UI |
|----------------|----------|
| `small` | Pequeno |
| `medium` | Médio |
| `large` | Grande |
| `giant` | Gigante |

FK composta: `(service_id, company_id) → services(id, company_id)`

## Dinheiro

- Armazenado em **centavos inteiros** (`price_cents`)
- Helpers: `src/lib/money.ts` — `parseBRLToCents`, `formatCentsToBRL`
- Limite máximo: R$ 9.999,99 (999.999 centavos)
- **Nunca** usar float para dinheiro

## Duração

- Mínimo: 5 minutos | Máximo: 720 minutos (12 h)
- **Fixed:** `services.duration_minutes`
- **By size:** duração específica em `service_size_prices.duration_minutes`
- `services.duration_minutes` em `by_size` guarda o **menor valor** entre os portes como fallback/documentação

## Pricing modes

### `fixed`

Um preço e uma duração para todos os portes.

### `by_size`

Quatro faixas obrigatórias (MVP): pequeno, médio, grande, gigante — cada uma com preço e duração.

## Troca de modelo (fixed ↔ by_size)

Operação **atômica** via RPC `update_service_with_prices`:

1. Remove todas as faixas existentes (`DELETE` físico em `service_size_prices`)
2. Atualiza `services.pricing_mode` e campos relacionados
3. Insere novas faixas se `by_size`

**Decisão:** faixas antigas são **removidas fisicamente** (não arquivadas) porque são dados auxiliares substituíveis; o serviço principal permanece com histórico via `updated_at`. Não há agenda ainda — quando existir, snapshots no agendamento preservarão valores históricos.

## Criação/atualização transacional

RPCs SECURITY DEFINER (grants mínimos, `auth.uid()` validado):

- `create_service_with_prices(...)`
- `update_service_with_prices(...)`

Evitam estado parcial (serviço criado sem faixas).

## Segurança

- `company_id` e `created_by` **somente server-side** (`requireCompanyContext`)
- RLS em `services` e `service_size_prices`
- Trigger `prevent_company_change` em ambas as tabelas
- IDOR → `notFound()` em rotas `[id]`
- Zero rows em mutações → mensagem genérica

## Rotas

| Rota | Função |
|------|--------|
| `/dashboard/servicos` | Lista, busca, filtro, paginação |
| `/dashboard/servicos/novo` | Cadastro |
| `/dashboard/servicos/[id]` | Detalhes, ativar/desativar, arquivar |
| `/dashboard/servicos/[id]/editar` | Edição |

## Preparação para agenda (documentação apenas)

Quando implementarmos agendamentos, **não** depender do preço atual do serviço para histórico financeiro.

Cada appointment deve armazenar snapshot:

- `service_name`
- `price_cents`
- `duration_minutes`

Assim, alterações futuras de preço não alteram registros antigos.

## Migration

`supabase/migrations/20260805210000_services.sql`

**MIGRATION PENDENTE** — aplicar manualmente no Supabase.
