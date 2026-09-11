import { roundQuantity } from "@/features/inventory/stock-engine";
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from "@/features/inventory/units";
import { addDaysToDateString } from "@/lib/timezone";

export const STOCK_ANALYTIC_CATEGORIES = [
  "entry",
  "return",
  "sale",
  "internal_use",
  "exit",
  "loss",
  "adjustment_positive",
  "adjustment_negative",
  "unknown",
] as const;

export type StockAnalyticCategory = (typeof STOCK_ANALYTIC_CATEGORIES)[number];

export const STOCK_ANALYTIC_CATEGORY_LABELS: Record<StockAnalyticCategory, string> = {
  entry: "Entrada",
  return: "Devolução",
  sale: "Venda",
  internal_use: "Uso interno",
  exit: "Saída manual",
  loss: "Perda",
  adjustment_positive: "Ajuste positivo",
  adjustment_negative: "Ajuste negativo",
  unknown: "Tipo desconhecido",
};

const KNOWN_TYPES = new Set<string>(STOCK_MOVEMENT_TYPES);

export type ClassifiableStockMovement = {
  type: string;
  quantity: number;
  previousQuantity?: number | null;
  newQuantity?: number | null;
};

export type ClassifiedStockMovement = {
  category: StockAnalyticCategory;
  signedQuantity: number;
  absoluteQuantity: number;
  knownType: boolean;
};

function signedFromBalances(
  previousQuantity: number | null | undefined,
  newQuantity: number | null | undefined,
): number | null {
  if (previousQuantity == null || newQuantity == null) {
    return null;
  }
  return roundQuantity(newQuantity - previousQuantity);
}

/**
 * Cada movimento cai em exatamente uma categoria analítica.
 * Tipos gravados pelo estoque/PDV não são alterados — só interpretados.
 */
export function classifyStockMovement(movement: ClassifiableStockMovement): ClassifiedStockMovement {
  const quantity = roundQuantity(Math.abs(movement.quantity));
  const type = movement.type;

  if (type === "entry") {
    return { category: "entry", signedQuantity: quantity, absoluteQuantity: quantity, knownType: true };
  }

  if (type === "return") {
    return { category: "return", signedQuantity: quantity, absoluteQuantity: quantity, knownType: true };
  }

  if (type === "sale") {
    return {
      category: "sale",
      signedQuantity: roundQuantity(-quantity),
      absoluteQuantity: quantity,
      knownType: true,
    };
  }

  if (type === "internal_use") {
    return {
      category: "internal_use",
      signedQuantity: roundQuantity(-quantity),
      absoluteQuantity: quantity,
      knownType: true,
    };
  }

  if (type === "exit") {
    return {
      category: "exit",
      signedQuantity: roundQuantity(-quantity),
      absoluteQuantity: quantity,
      knownType: true,
    };
  }

  if (type === "loss") {
    return {
      category: "loss",
      signedQuantity: roundQuantity(-quantity),
      absoluteQuantity: quantity,
      knownType: true,
    };
  }

  if (type === "adjustment") {
    const signed =
      signedFromBalances(movement.previousQuantity, movement.newQuantity) ?? roundQuantity(movement.quantity);
    if (signed >= 0) {
      return {
        category: "adjustment_positive",
        signedQuantity: signed,
        absoluteQuantity: Math.abs(signed),
        knownType: true,
      };
    }
    return {
      category: "adjustment_negative",
      signedQuantity: signed,
      absoluteQuantity: Math.abs(signed),
      knownType: true,
    };
  }

  const signed =
    signedFromBalances(movement.previousQuantity, movement.newQuantity) ?? roundQuantity(movement.quantity);

  return {
    category: "unknown",
    signedQuantity: signed,
    absoluteQuantity: Math.abs(signed),
    knownType: KNOWN_TYPES.has(type),
  };
}

export function emptyCategoryTotals(): Record<StockAnalyticCategory, number> {
  return {
    entry: 0,
    return: 0,
    sale: 0,
    internal_use: 0,
    exit: 0,
    loss: 0,
    adjustment_positive: 0,
    adjustment_negative: 0,
    unknown: 0,
  };
}

export function addCategoryQuantity(
  totals: Record<StockAnalyticCategory, number>,
  category: StockAnalyticCategory,
  absoluteQuantity: number,
): void {
  totals[category] = roundQuantity(totals[category] + absoluteQuantity);
}

export function periodNetFromCategories(totals: Record<StockAnalyticCategory, number>): number {
  return roundQuantity(
    totals.entry +
      totals.return +
      totals.adjustment_positive -
      totals.sale -
      totals.internal_use -
      totals.exit -
      totals.loss -
      totals.adjustment_negative +
      0,
  );
}

export const STOCK_EXPIRING_WINDOW_DAYS = 30;

export type BatchExpirationBucket = "expired" | "expires_today" | "expiring_soon" | "ok" | "no_date";

/**
 * Validade analítica por data civil da empresa.
 * Vencido: expiration_date < today
 * Vence hoje: expiration_date = today
 * A vencer: today < expiration_date <= today + 30
 */
export function classifyBatchExpiration(
  expirationDate: string | null | undefined,
  today: string,
  windowDays: number = STOCK_EXPIRING_WINDOW_DAYS,
): BatchExpirationBucket {
  if (!expirationDate) {
    return "no_date";
  }

  const date = expirationDate.slice(0, 10);
  if (date < today) {
    return "expired";
  }
  if (date === today) {
    return "expires_today";
  }

  const windowEnd = addDaysToDateString(today, windowDays);
  if (date <= windowEnd) {
    return "expiring_soon";
  }

  return "ok";
}

export function isKnownStockMovementType(type: string): type is StockMovementType {
  return KNOWN_TYPES.has(type);
}
