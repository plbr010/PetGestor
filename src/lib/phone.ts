const BRAZILIAN_PHONE_REGEX = /^(\d{10,11})$/;

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("55") && digits.length >= 12) {
    return digits.slice(-11);
  }

  return digits;
}

export function isValidBrazilianPhone(value: string): boolean {
  const normalized = normalizePhone(value);

  if (!BRAZILIAN_PHONE_REGEX.test(normalized)) {
    return false;
  }

  const ddd = Number(normalized.slice(0, 2));

  if (ddd < 11 || ddd > 99) {
    return false;
  }

  return true;
}

export function formatPhoneDisplay(value: string): string {
  const normalized = normalizePhone(value);

  if (normalized.length === 10) {
    return normalized.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }

  if (normalized.length === 11) {
    return normalized.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }

  return value;
}

export function formatPhoneInput(value: string): string {
  const digits = normalizePhone(value).slice(0, 11);

  if (digits.length <= 2) {
    return digits.length ? `(${digits}` : "";
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
