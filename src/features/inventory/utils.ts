import { formatQuantity, roundQuantity, type StockStatus } from "@/features/inventory/stock-engine";
import {
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNIT_SHORT_LABELS,
  STOCK_EXIT_REASON_LABELS,
  STOCK_MOVEMENT_TYPE_LABELS,
  type ProductUnit,
  type StockExitReason,
  type StockMovementType,
} from "@/features/inventory/units";
import { addDaysToDateString, formatUtcDateInTimezone } from "@/lib/timezone";

export function getSignedMovementQuantity(input: {
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
}): number {
  if (input.type === "adjustment") {
    return roundQuantity(input.newQuantity - input.previousQuantity);
  }

  if (input.type === "entry" || input.type === "return") {
    return roundQuantity(input.quantity);
  }

  return roundQuantity(-input.quantity);
}

export function formatSignedQuantity(value: number, unit: ProductUnit): string {
  const formatted = formatQuantity(Math.abs(value), PRODUCT_UNIT_SHORT_LABELS[unit]);
  if (value > 0) {
    return `+${formatted}`;
  }

  if (value < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

export function formatUnitLabel(unit: ProductUnit): string {
  return PRODUCT_UNIT_LABELS[unit];
}

export function formatMovementType(type: StockMovementType, reason?: string | null): string {
  if (type === "exit" && reason && reason in STOCK_EXIT_REASON_LABELS) {
    return STOCK_EXIT_REASON_LABELS[reason as StockExitReason];
  }

  return STOCK_MOVEMENT_TYPE_LABELS[type];
}

export function stockStatusBadgeVariant(
  status: StockStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "out") {
    return "destructive";
  }

  if (status === "archived") {
    return "secondary";
  }

  if (status === "low") {
    return "outline";
  }

  return "default";
}

export function formatMovementWhen(isoUtc: string, timeZone: string): string {
  const localDate = formatUtcDateInTimezone(isoUtc, timeZone);
  const today = formatUtcDateInTimezone(new Date().toISOString(), timeZone);
  const yesterday = addDaysToDateString(today, -1);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(isoUtc));

  if (localDate === today) {
    return `Hoje ${time}`;
  }

  if (localDate === yesterday) {
    return `Ontem ${time}`;
  }

  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone,
  }).format(new Date(isoUtc));

  return `${date} ${time}`;
}

export function mapStockRpcError(message: string | undefined): string {
  const text = message ?? "";

  if (text.includes("insufficient_stock") || text.includes("negative_stock")) {
    return "Estoque insuficiente. O saldo não pode ficar negativo.";
  }

  if (text.includes("archived_product")) {
    return "Este produto está arquivado e não pode ser movimentado.";
  }

  if (text.includes("no_stock_change")) {
    return "A contagem física é igual ao estoque atual.";
  }

  if (text.includes("invalid_counted_stock") || text.includes("invalid_quantity")) {
    return "Informe uma quantidade válida.";
  }

  if (text.includes("product_not_found")) {
    return "Não foi possível concluir a operação. Verifique os dados e tente novamente.";
  }

  return "Não foi possível registrar a movimentação. Tente novamente.";
}
