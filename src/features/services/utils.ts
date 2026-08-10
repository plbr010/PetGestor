import type { PetSize, ServicePricingMode } from "@/types/database.types";
import {
  formatCentsToBRL,
  isValidDurationMinutes,
  isValidPriceCents,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  parseBRLToCents,
} from "@/lib/money";
import type { ServiceSizePriceInput } from "@/features/services/types";

export const PET_SIZES: PetSize[] = ["small", "medium", "large", "giant"];

export const PET_SIZE_LABELS: Record<PetSize, string> = {
  small: "Pequeno",
  medium: "Médio",
  large: "Grande",
  giant: "Gigante",
};

export const PRICING_MODE_LABELS: Record<ServicePricingMode, string> = {
  fixed: "Preço fixo",
  by_size: "Preço por porte",
};

export function parseStatusFilter(value: string | undefined | null): "all" | "active" | "inactive" {
  if (value === "active" || value === "inactive") {
    return value;
  }

  return "all";
}

export function formatDurationLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (remainder === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${remainder} min`;
}

export function formatServicePriceSummary(
  pricingMode: ServicePricingMode,
  priceCents: number | null,
  sizePrices: { price_cents: number }[],
): string {
  if (pricingMode === "fixed") {
    return priceCents !== null ? formatCentsToBRL(priceCents) : "—";
  }

  if (sizePrices.length === 0) {
    return "—";
  }

  const minPrice = Math.min(...sizePrices.map((row) => row.price_cents));
  return `A partir de ${formatCentsToBRL(minPrice)}`;
}

export function formatServiceDurationSummary(
  pricingMode: ServicePricingMode,
  durationMinutes: number,
  sizePrices: { duration_minutes: number }[],
): string {
  if (pricingMode === "fixed") {
    return formatDurationLabel(durationMinutes);
  }

  if (sizePrices.length === 0) {
    return formatDurationLabel(durationMinutes);
  }

  const durations = sizePrices.map((row) => row.duration_minutes);
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  if (minDuration === maxDuration) {
    return formatDurationLabel(minDuration);
  }

  return `${minDuration}–${maxDuration} min`;
}

export function parseDurationInput(value: FormDataEntryValue | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();

  if (raw.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || !isValidDurationMinutes(parsed)) {
    return null;
  }

  return parsed;
}

export function parsePriceInput(value: FormDataEntryValue | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();

  if (raw.length === 0) {
    return null;
  }

  return parseBRLToCents(raw);
}

export function parseSizePricesFromForm(formData: FormData): ServiceSizePriceInput[] | null {
  const rows: ServiceSizePriceInput[] = [];

  for (const size of PET_SIZES) {
    const priceCents = parsePriceInput(formData.get(`size_${size}_price`));
    const durationMinutes = parseDurationInput(formData.get(`size_${size}_duration`));

    if (priceCents === null || durationMinutes === null) {
      return null;
    }

    if (!isValidPriceCents(priceCents) || !isValidDurationMinutes(durationMinutes)) {
      return null;
    }

    rows.push({ size, priceCents, durationMinutes });
  }

  return rows;
}

export function sizePricesToRpcPayload(
  sizePrices: ServiceSizePriceInput[],
): { size: PetSize; price_cents: number; duration_minutes: number }[] {
  return sizePrices.map((row) => ({
    size: row.size,
    price_cents: row.priceCents,
    duration_minutes: row.durationMinutes,
  }));
}

export { MIN_DURATION_MINUTES, MAX_DURATION_MINUTES };
