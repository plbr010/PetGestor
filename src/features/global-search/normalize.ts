import { sanitizeSearchTerm } from "@/lib/pagination";
import { normalizePhone } from "@/lib/phone";

const ACCENT_MAP: Record<string, string> = {
  á: "a",
  à: "a",
  â: "a",
  ã: "a",
  ä: "a",
  é: "e",
  è: "e",
  ê: "e",
  ë: "e",
  í: "i",
  ì: "i",
  î: "i",
  ï: "i",
  ó: "o",
  ò: "o",
  ô: "o",
  õ: "o",
  ö: "o",
  ú: "u",
  ù: "u",
  û: "u",
  ü: "u",
  ç: "c",
  ñ: "n",
};

/** Remove acentos e normaliza para comparação / ranking. */
export function foldSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/gi, (char) => {
      const folded = ACCENT_MAP[char.toLowerCase()];
      return folded ?? char.toLowerCase();
    });
}

export function prepareSearchQuery(raw: string): {
  term: string;
  folded: string;
  phoneDigits: string;
} {
  const term = sanitizeSearchTerm(raw);
  return {
    term,
    folded: foldSearchText(term),
    phoneDigits: normalizePhone(term),
  };
}

/**
 * Ranking simples e previsível (menor = melhor):
 * 0 exact, 1 prefix, 2 contains, 3 weak/other.
 */
export function rankMatch(candidate: string, foldedQuery: string): number {
  const folded = foldSearchText(candidate);

  if (!foldedQuery) {
    return 3;
  }

  if (folded === foldedQuery) {
    return 0;
  }

  if (folded.startsWith(foldedQuery)) {
    return 1;
  }

  if (folded.includes(foldedQuery)) {
    return 2;
  }

  return 3;
}

export function bestRank(fields: Array<string | null | undefined>, foldedQuery: string): number {
  let best = 3;
  for (const field of fields) {
    if (!field) continue;
    best = Math.min(best, rankMatch(field, foldedQuery));
  }
  return best;
}

/** Escape mínimo para padrões PostgREST .or() */
export function escapeIlike(term: string): string {
  return term.replace(/[%_,]/g, " ").trim();
}
