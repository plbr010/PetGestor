/**
 * Helpers de moeda brasileira — valores armazenados em centavos inteiros.
 */

export const MAX_PRICE_CENTS = 999_999;
export const MAX_INVENTORY_PRICE_CENTS = 99_999_999;
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 720;

export function parseBRLToCents(
  input: string,
  maxCents: number = MAX_PRICE_CENTS,
): number | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const normalized = input
    .trim()
    .replace(/\s/g, "")
    .replace(/^R\$/i, "");

  if (normalized.length === 0) {
    return null;
  }

  if (!/^[\d.,]+$/.test(normalized)) {
    return null;
  }

  let reaisPart: string;
  let centsPart = "00";

  if (normalized.includes(",")) {
    const parts = normalized.split(",");
    if (parts.length !== 2) {
      return null;
    }

    reaisPart = parts[0].replace(/\./g, "");
    centsPart = parts[1];

    if (centsPart.length === 0 || centsPart.length > 2) {
      return null;
    }

    if (!/^\d+$/.test(reaisPart) || !/^\d+$/.test(centsPart)) {
      return null;
    }
  } else if (normalized.includes(".")) {
    const dotCount = (normalized.match(/\./g) ?? []).length;

    if (dotCount > 1) {
      reaisPart = normalized.replace(/\./g, "");
    } else {
      const dotIndex = normalized.indexOf(".");
      const afterDot = normalized.slice(dotIndex + 1);

      if (afterDot.length === 2) {
        reaisPart = normalized.slice(0, dotIndex);
        centsPart = afterDot;
      } else {
        reaisPart = normalized.replace(/\./g, "");
      }
    }

    if (!/^\d+$/.test(reaisPart) || !/^\d+$/.test(centsPart)) {
      return null;
    }
  } else {
    reaisPart = normalized;

    if (!/^\d+$/.test(reaisPart)) {
      return null;
    }
  }

  if (reaisPart.length === 0) {
    return null;
  }

  const reais = Number.parseInt(reaisPart, 10);
  const cents = Number.parseInt(centsPart.padEnd(2, "0").slice(0, 2), 10);

  if (!Number.isFinite(reais) || !Number.isFinite(cents)) {
    return null;
  }

  const total = reais * 100 + cents;

  if (total < 0 || total > maxCents) {
    return null;
  }

  return total;
}

export function formatCentsToBRL(cents: number): string {
  if (!Number.isFinite(cents)) {
    return "R$ 0,00";
  }

  const safeCents = Math.max(0, Math.round(cents));
  const reais = Math.floor(safeCents / 100);
  const remainder = safeCents % 100;

  return `R$ ${reais.toLocaleString("pt-BR")},${String(remainder).padStart(2, "0")}`;
}

export function formatCentsToInput(cents: number): string {
  return formatCentsToBRL(cents).replace(/^R\$\s?/, "");
}

export function isValidPriceCents(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 0 && cents <= MAX_PRICE_CENTS;
}

export function isValidDurationMinutes(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= MIN_DURATION_MINUTES &&
    minutes <= MAX_DURATION_MINUTES
  );
}
