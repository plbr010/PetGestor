import type { FinancialSourceType } from "@/types/database.types";

import type { FinanceOriginKey } from "@/features/finance/analytics/types";

export const INCOME_ORIGIN_LABELS: Record<FinancialSourceType, string> = {
  service_order: "Serviços / Atendimentos",
  sale: "PDV / Produtos",
  service_package: "Pacotes",
  manual: "Receitas manuais",
};

export const DEFAULT_EXPENSE_CATEGORY = "Outras despesas";

export const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {
  produtos: "Estoque / Produtos",
  estoque: "Estoque / Produtos",
  fornecedores: "Fornecedores",
  aluguel: "Aluguel",
  energia: "Energia",
  água: "Água",
  agua: "Água",
  marketing: "Marketing",
  equipamentos: "Equipamentos",
  manutenção: "Manutenção",
  manutencao: "Manutenção",
  funcionários: "Funcionários",
  funcionarios: "Funcionários",
  outros: "Outras despesas",
};

export function incomeOriginLabel(sourceType: FinancialSourceType): string {
  return INCOME_ORIGIN_LABELS[sourceType] ?? "Outros";
}

export function normalizeExpenseCategory(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return DEFAULT_EXPENSE_CATEGORY;
  }

  const alias = EXPENSE_CATEGORY_ALIASES[trimmed.toLowerCase()];
  return alias ?? trimmed;
}

export function originFilterKey(key: FinanceOriginKey): string {
  return key;
}
