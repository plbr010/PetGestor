"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { notifyPaymentPending } from "@/features/app-notifications/emitters";
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
import { requirePermission } from "@/lib/auth/require-permission";
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
  const context = await requirePermission("finance.create");
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
      status: "pending",
      source_type: "manual",
      description: parsed.data.description,
      category: parsed.data.category,
      amount_cents: amountCents,
      due_date: parsed.data.dueDate ?? null,
      payment_method: null,
      paid_at: null,
      notes: parsed.data.notes,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow({ data, error }) || !data) {
    return { error: "Não foi possível criar o lançamento." };
  }

  if (parsed.data.status === "paid") {
    const paymentKey =
      parsed.data.idempotencyKey ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${data.id}-manual-paid`);

    const paid = await supabase.rpc("mark_financial_entry_paid", {
      p_entry_id: data.id,
      p_payment_method: parsed.data.paymentMethod!,
      p_paid_at: new Date().toISOString(),
      p_company_id: context.membership.company.id,
      p_amount_cents: amountCents,
      p_idempotency_key: paymentKey,
    });

    if (paid.error || !paid.data) {
      return { error: mapFinanceError(paid.error?.message) };
    }
  } else {
    await notifyPaymentPending(supabase, context.membership.company.id, data.id);
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

  const context = await requirePermission("finance.edit");
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

  if (existing.status !== "pending") {
    return { error: "Reabra o lançamento antes de editar o valor." };
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

  const context = await requirePermission("finance.create");
  const parsed = parseMarkPaidForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const amountCents = parsed.data.amount ? parseAmountToCents(parsed.data.amount) : null;
  if (parsed.data.amount && amountCents === null) {
    return { error: "Informe um valor de pagamento válido." };
  }

  const supabase = await createSupabaseServerClient();
  const paidAt = parsed.data.paidAt
    ? localDateTimeToUtcIsoFromInput(parsed.data.paidAt, context.membership.company.timezone)
    : undefined;

  const { data, error } = await supabase.rpc("mark_financial_entry_paid", {
    p_entry_id: entryId,
    p_payment_method: parsed.data.paymentMethod,
    p_paid_at: paidAt ?? null,
    p_company_id: context.membership.company.id,
    p_amount_cents: amountCents,
    p_idempotency_key: parsed.data.idempotencyKey,
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

  const context = await requirePermission("finance.edit");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("reopen_financial_entry", {
    p_entry_id: entryId,
    p_company_id: context.membership.company.id,
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

  const context = await requirePermission("finance.edit");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("cancel_financial_entry", {
    p_entry_id: entryId,
    p_company_id: context.membership.company.id,
  });

  if (error || !data) {
    return { error: mapFinanceError(error?.message) };
  }

  revalidateFinancePaths(entryId);
  return { success: "Lançamento cancelado." };
}
