# PetGestor — Tutores e Pets

## Visão geral

Primeiros módulos de negócio multiempresa:

- **Tutores** (interface) → tabela `customers` (banco)
- **Pets** → tabela `pets`

```text
companies → customers → pets
```

## Rotas

| Rota | Função |
|------|--------|
| `/dashboard/tutores` | Lista, busca, paginação |
| `/dashboard/tutores/novo` | Cadastro |
| `/dashboard/tutores/[id]` | Detalhes + pets vinculados |
| `/dashboard/tutores/[id]/editar` | Edição |
| `/dashboard/pets` | Lista, busca, filtro espécie |
| `/dashboard/pets/novo` | Cadastro (`?tutor=uuid` pré-seleciona) |
| `/dashboard/pets/[id]` | Detalhes |
| `/dashboard/pets/[id]/editar` | Edição |

## Server Actions

### Tutores (`src/features/customers/actions.ts`)

- `createCustomerAction`
- `updateCustomerAction`
- `archiveCustomerAction`
- `restoreCustomerAction`

### Pets (`src/features/pets/actions.ts`)

- `createPetAction`
- `updatePetAction`
- `archivePetAction`
- `restorePetAction`

Todas obtêm `company_id` e `created_by` no servidor via `requireCompanyContext()`.

## Consultas

- `getCustomers`, `getCustomerById`, `getCustomerOptions`, `countActiveCustomers`
- `getPets`, `getPetById`, `getPetsByCustomer`, `countActivePets`

Paginação: 20 registros/página (`?page=`).

Busca tutores: `?q=` (nome, telefone, e-mail).

Busca pets: `?q=` (nome, raça) + `?species=dog|cat|other|all`.

## Arquivamento

Soft delete via `deleted_at`. Sem DELETE físico.

Regra MVP: tutor com pets ativos **não pode** ser arquivado.

## Telefone

- Formulário: máscara amigável `(32) 99999-9999`
- Banco: somente dígitos (`32999999999`)
- Helpers: `src/lib/phone.ts`

## Segurança

- RLS em `customers` e `pets`
- FK composta impede pet ↔ tutor de empresas diferentes
- `company_id` imutável via trigger `private.prevent_company_change`
- IDOR → `notFound()` quando registro não pertence à empresa

## Migration

`supabase/migrations/20260805204500_customers_pets.sql`

**Pendente aplicação no Supabase remoto** até execução manual no SQL Editor.
