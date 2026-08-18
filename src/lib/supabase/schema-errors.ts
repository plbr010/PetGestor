/** Erros Supabase/PostgREST quando tabela, coluna ou RPC ainda não existe (migration pendente). */
const MISSING_SCHEMA_CODES = new Set([
  "42P01",
  "42703",
  "PGRST116",
  "PGRST202",
  "PGRST205",
]);

export function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: string; message?: string };
  const message = record.message?.toLowerCase() ?? "";

  return (
    (record.code !== undefined && MISSING_SCHEMA_CODES.has(record.code)) ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache")
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "Erro desconhecido";
}
