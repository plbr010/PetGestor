export function parseOptionalDate(value: string | undefined | null): string | null {
  if (!value || !value.trim()) {
    return null;
  }

  return value.trim();
}

export function isFutureDate(dateString: string): boolean {
  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date > today;
}

export function formatDateDisplay(dateString: string | null): string {
  if (!dateString) {
    return "—";
  }

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatDateTimeDisplay(dateString: string): string {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function calculateAgeLabel(birthDate: string | null): string {
  if (!birthDate) {
    return "—";
  }

  const birth = new Date(`${birthDate}T00:00:00`);

  if (Number.isNaN(birth.getTime())) {
    return "—";
  }

  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }

  if (years < 0) {
    return "—";
  }

  if (years === 0) {
    return "Menos de 1 ano";
  }

  return years === 1 ? "1 ano" : `${years} anos`;
}

export const SPECIES_LABELS = {
  dog: "Cão",
  cat: "Gato",
  other: "Outro",
} as const;

export const SEX_LABELS = {
  male: "Macho",
  female: "Fêmea",
  unknown: "Não informado",
} as const;
