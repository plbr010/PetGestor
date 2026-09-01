"use server";

import { DEMO_CLEANUP_CONFIRMATION_PHRASE } from "@/config/demo-accounts";
import {
  deleteDemoAccounts,
  listDemoAccountCandidates,
  type DemoAccountCleanupResult,
} from "@/features/admin/demo-account-cleanup";
import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";

export type DemoAccountCleanupActionState = {
  error?: string;
  success?: string;
  result?: DemoAccountCleanupResult;
};

export async function deleteDemoAccountsAction(
  _prevState: DemoAccountCleanupActionState,
  formData: FormData,
): Promise<DemoAccountCleanupActionState> {
  await requirePlatformAdmin();

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const companyIds = formData
    .getAll("companyId")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (confirmation !== DEMO_CLEANUP_CONFIRMATION_PHRASE) {
    return {
      error: `Digite exatamente "${DEMO_CLEANUP_CONFIRMATION_PHRASE}" para confirmar.`,
    };
  }

  if (companyIds.length === 0) {
    return { error: "Nenhuma conta demo selecionada para remoção." };
  }

  const candidates = await listDemoAccountCandidates();
  const allowedIds = new Set(candidates.map((item) => item.companyId));
  const filteredIds = companyIds.filter((id) => allowedIds.has(id));

  if (filteredIds.length === 0) {
    return { error: "Nenhuma das contas selecionadas é elegível para remoção." };
  }

  const result = await deleteDemoAccounts(filteredIds);

  if (result.deletedCompanies === 0) {
    return {
      error:
        result.errors[0] ??
        "Nenhuma conta foi removida. Verifique os critérios de proteção e tente novamente.",
      result,
    };
  }

  const summary = [
    `${result.deletedCompanies} empresa(s) removida(s)`,
    `${result.deletedUsers} usuário(s) removido(s)`,
  ];

  if (result.skippedProtected > 0) {
    summary.push(`${result.skippedProtected} conta(s) protegida(s) ignorada(s)`);
  }

  if (result.errors.length > 0) {
    summary.push(`${result.errors.length} aviso(s)`);
  }

  return {
    success: `Limpeza concluída: ${summary.join(", ")}.`,
    result,
  };
}
