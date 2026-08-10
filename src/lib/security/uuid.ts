import { z } from "zod";

const uuidSchema = z.uuid();

export function isValidUuid(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return uuidSchema.safeParse(value).success;
}

export function parseUuid(value: string | null | undefined): string | null {
  if (!isValidUuid(value)) {
    return null;
  }

  return value;
}
