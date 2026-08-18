export const PRODUCT_UNITS = ["unit", "kg", "g", "ml", "l", "pack", "box", "other"] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  unit: "Unidade",
  kg: "Kg",
  g: "g",
  ml: "ml",
  l: "Litro",
  pack: "Pacote",
  box: "Caixa",
  other: "Outro",
};

export const PRODUCT_UNIT_SHORT_LABELS: Record<ProductUnit, string> = {
  unit: "un",
  kg: "kg",
  g: "g",
  ml: "ml",
  l: "L",
  pack: "pct",
  box: "cx",
  other: "un",
};

export const STOCK_MOVEMENT_TYPES = [
  "entry",
  "exit",
  "adjustment",
  "loss",
  "internal_use",
  "return",
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  entry: "Entrada",
  exit: "Saída",
  adjustment: "Ajuste",
  loss: "Perda",
  internal_use: "Uso interno",
  return: "Devolução",
};

export const STOCK_EXIT_REASONS = [
  "internal_use",
  "loss",
  "damage",
  "expired",
  "adjustment",
  "other",
] as const;

export type StockExitReason = (typeof STOCK_EXIT_REASONS)[number];

export const STOCK_EXIT_REASON_LABELS: Record<StockExitReason, string> = {
  internal_use: "Uso interno",
  loss: "Perda",
  damage: "Avaria",
  expired: "Vencimento",
  adjustment: "Ajuste",
  other: "Outro",
};

export function movementTypeFromExitReason(
  reason: StockExitReason,
): Exclude<StockMovementType, "entry" | "return" | "adjustment"> {
  if (reason === "internal_use") {
    return "internal_use";
  }

  if (reason === "loss") {
    return "loss";
  }

  return "exit";
}

export const DEFAULT_PRODUCT_CATEGORY_NAMES = [
  "Higiene",
  "Shampoo",
  "Medicamentos não controlados",
  "Ração",
  "Petiscos",
  "Acessórios",
  "Limpeza",
  "Uso interno",
  "Outros",
] as const;
