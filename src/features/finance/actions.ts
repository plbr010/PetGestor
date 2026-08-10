"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseManualExpenseForm,
  parseManualIncomeForm,
  parseManualUpdateForm,
  parseMarkPaidForm,
} from "@/features/finance/schemas";
import {
  localDateTimeToUtcIsoFromInput,
  mapFinanceError,
  parseAmountToCents,
} from "@/features/finance/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FinancialEntryType } from "@/types/database.types";

export type FinanceActionState = {
  error?: string;
  success?: string;
};

function revalidateFinancePaths(entryId?: string, serviceOrderId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/financeiro");

  if (entryId) {
    revalidatePath(`/dashboard/financeiro/${entryId}`);
  }

  if (serviceOrderId) {
    revalidatePath(`/dashboard/atendimentos/${serviceOrderId}`);
  }

  revalidatePath("/dashboard/atendimentos");
}

async function createManualEntry(
  entryType: FinancialEntryType,
  formData: FormData,
): Promise<FinanceActionState> {
  const context = await requireCompanyContext();
  const parsed =
    entryType === "income"
      ? parseManualIncomeForm(formData)
      : parseManualExpenseForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const amountCents = parseAmountToCents(parsed.data.amount);
  if (amountCents === null) {
    return { error: "Informe um valor válido." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const { data, error } = await supabase
    .from("financial_entries")
    .insert({
      company_id: context.membership.company.id,
      entry_type: entryType,
      status: parsed.data.status,
      source_type: "manual",
      description: parsed.data.description,
      category: parsed.data.category,
      amount_cents: amountCents,
      due_date: parsed.data.dueDate ?? null,
      payment_method: parsed.data.status === "paid" ? parsed.data.paymentMethod : null,
      paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
      notes: parsed.data.notes,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error }) || !data) {
    return { error: "Não foi possível criar o lançamento." };
  }

  revalidateFinancePaths(data.id);
  redirect(`/dashboard/financeiro/${data.id}`);
}

export async function createManualFinancialEntryAction(
  entryType: FinancialEntryType,
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  return createManualEntry(entryType, formData);
}

export async function createManualIncomeAction(
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  return createManualEntry("income", formData);
}

export async function createManualExpenseAction(
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  return createManualEntry("expense", formData);
}

export async function updateManualFinancialEntryAction(
  entryId: string,
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  if (!isValidUuid(entryId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const parsed = parseManualUpdateForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const amountCents = parseAmountToCents(parsed.data.amount);
  if (amountCents === null) {
    return { error: "Informe um valor válido." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("financial_entries")
    .select("id, source_type, status")
    .eq("id", entryId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !existing) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  if (existing.source_type !== "manual") {
    return { error: "Somente lançamentos manuais podem ser editados." };
  }

  if (existing.status === "paid") {
    return { error: "Reabra o lançamento antes de editar o valor." };
  }

  if (existing.status === "cancelled") {
    return { error: "Lançamento cancelado não pode ser editado." };
  }

  const { data, error } = await supabase
    .from("financial_entries")
    .update({
      description: parsed.data.description,
      category: parsed.data.category,
      amount_cents: amountCents,
      due_date: parsed.data.dueDate ?? null,
      notes: parsed.data.notes,
    })
    .eq("id", entryId)
    .eq("company_id", context.membership.company.id)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error })) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateFinancePaths(entryId);
  return { success: "Lançamento atualizado." };
}

export async function markFinancialEntryPaidAction(
  entryId: string,
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  if (!isValidUuid(entryId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const parsed = parseMarkPaidForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const paidAt = parsed.data.paidAt
    ? localDateTimeToUtcIsoFromInput(parsed.data.paidAt, context.membership.company.timezone)
    : undefined;

  const { data, error } = await supabase.rpc("mark_financial_entry_paid", {
    p_entry_id: entryId,
    p_payment_method: parsed.data.paymentMethod,
    p_paid_at: paidAt ?? null,
  });

  if (error || !data) {
    return { error: mapFinanceError(error?.message) };
  }

  const entry = await supabase
    .from("financial_entries")
    .select("service_order_id")
    .eq("id", entryId)
    .maybeSingle();

  revalidateFinancePaths(entryId, entry.data?.service_order_id ?? undefined);
  return { success: "Pagamento registrado." };
}

export async function reopenFinancialEntryAction(
  entryId: string,
): Promise<FinanceActionState> {
  if (!isValidUuid(entryId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("reopen_financial_entry", {
    p_entry_id: entryId,
  });

  if (error || !data) {
    return { error: mapFinanceError(error?.message) };
  }

  revalidateFinancePaths(entryId);
  return { success: "Lançamento reaberto como pendente." };
}

export async function cancelFinancialEntryAction(
  entryId: string,
): Promise<FinanceActionState> {
  if (!isValidUuid(entryId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("cancel_financial_entry", {
    p_entry_id: entryId,
  });

  if (error || !data) {
    return { error: mapFinanceError(error?.message) };
  }

  revalidateFinancePaths(entryId);
  return { success: "Lançamento cancelado." };
}
