/**
 * Helpers de defense-in-depth para isolamento multi-tenant na camada de aplicação.
 * Não substituem RLS — complementam verificações server-side.
 */

export const GENERIC_NOT_FOUND_MESSAGE =
  "Não foi possível concluir a operação. Verifique os dados e tente novamente.";

export type ResourceMutationResult<T extends { id: string }> = {
  data: T | null;
  error: { code?: string; message?: string } | null;
};

/**
 * Retorna true quando a mutação afetou exatamente um registro acessível.
 */
export function didMutateAccessibleRow<T extends { id: string }>(
  result: ResourceMutationResult<T>,
): result is ResourceMutationResult<T> & { data: T } {
  return !result.error && Boolean(result.data);
}

/**
 * Indica se um recurso deve ser tratado como inexistente/inacessível (404 genérico).
 */
export function shouldTreatAsNotFound(
  resourceExists: boolean,
  belongsToCurrentCompany: boolean,
): boolean {
  return !resourceExists || !belongsToCurrentCompany;
}
