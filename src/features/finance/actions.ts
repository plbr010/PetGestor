"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseCloseCashForm,
  parseRecordPaymentForm,
  validatePaymentAmount,
} from "@/features/finance/payments/schemas";
import { parseBRLToCents } from "@/lib/money";
import {
  parseManualExpenseForm,
  parseManualIncomeForm,
  parseManualUpdateForm,
  parseMarkPaidForm,
} from "@/features/finance/schemas";
import {
  localDateTimeToUtcIsoFromInput,
  mapFinanceError,
  MAX_FINANCE_AMOUNT_CENTS,
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

function parseNonNegativeAmountToCents(input: string): number | null {
  const cents = parseBRLToCents(input);
  if (cents === null || cents < 0 || cents > MAX_FINANCE_AMOUNT_CENTS) {
    return null;
  }

  return cents;
}

function revalidateFinancePaths(entryId?: string, serviceOrderId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/financeiro");
  revalidatePath("/dashboard/financeiro/fechamento");

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

  const initialStatus = parsed.data.status === "paid" ? "pending" : parsed.data.status;

  const { data, error } = await supabase
    .from("financial_entries")
    .insert({
      company_id: context.membership.company.id,
      entry_type: entryType,
      status: initialStatus,
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

  if (parsed.data.status === "paid" && parsed.data.paymentMethod) {
    const { error: paymentError } = await supabase.rpc("record_financial_payment", {
      p_entry_id: data.id,
      p_amount_cents: amountCents,
      p_payment_method: parsed.data.paymentMethod,
      p_paid_at: new Date().toISOString(),
      p_notes: null,
      p_idempotency_key: null,
    });

    if (paymentError) {
      return { error: mapFinanceError(paymentError.message) };
    }
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

  if (existing.status === "paid" || existing.status === "partially_paid") {
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

export async function recordFinancialPaymentAction(
  entryId: string,
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  if (!isValidUuid(entryId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const parsed = parseRecordPaymentForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: entry } = await supabase
    .from("financial_entries")
    .select("amount_cents")
    .eq("id", entryId)
    .eq("company_id", context.membership.company.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!entry) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const { data: payments } = await supabase
    .from("financial_payments")
    .select("amount_cents")
    .eq("financial_entry_id", entryId)
    .eq("company_id", context.membership.company.id)
    .is("cancelled_at", null);

  const paidCents = payments?.reduce((sum, row) => sum + row.amount_cents, 0) ?? 0;
  const remainingCents = Math.max(entry.amount_cents - paidCents, 0);
  const amountValidation = validatePaymentAmount(parsed.data.amount, remainingCents);

  if ("error" in amountValidation) {
    return { error: amountValidation.error };
  }

  const paidAt = parsed.data.paidAt
    ? localDateTimeToUtcIsoFromInput(parsed.data.paidAt, context.membership.company.timezone)
    : undefined;

  const { data, error } = await supabase.rpc("record_financial_payment", {
    p_entry_id: entryId,
    p_amount_cents: amountValidation.cents,
    p_payment_method: parsed.data.paymentMethod,
    p_paid_at: paidAt ?? null,
    p_notes: parsed.data.notes,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error || !data) {
    return { error: mapFinanceError(error?.message) };
  }

  const linked = await supabase
    .from("financial_entries")
    .select("service_order_id")
    .eq("id", entryId)
    .maybeSingle();

  revalidateFinancePaths(entryId, linked.data?.service_order_id ?? undefined);
  return { success: "Pagamento registrado." };
}

export async function cancelFinancialPaymentAction(
  paymentId: string,
  entryId: string,
): Promise<FinanceActionState> {
  if (!isValidUuid(paymentId) || !isValidUuid(entryId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("cancel_financial_payment", {
    p_payment_id: paymentId,
  });

  if (error || !data) {
    return { error: mapFinanceError(error?.message) };
  }

  revalidateFinancePaths(entryId);
  return { success: "Pagamento estornado." };
}

export async function closeCashClosingAction(
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  await requireCompanyContext();
  const parsed = parseCloseCashForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const openingBalance =
    parseNonNegativeAmountToCents(parsed.data.openingBalance ?? "0") ?? 0;
  const actualCashRaw = String(parsed.data.actualCash ?? "").trim();
  const actualCash =
    actualCashRaw.length > 0 ? parseNonNegativeAmountToCents(actualCashRaw) : null;

  if (actualCashRaw.length > 0 && actualCash === null) {
    return { error: "Informe um valor contado válido." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("close_cash_closing", {
    p_business_date: parsed.data.businessDate,
    p_opening_balance_cents: openingBalance,
    p_actual_cash_cents: actualCash,
    p_notes: parsed.data.notes,
  });

  if (error || !data) {
    return { error: mapFinanceError(error?.message) };
  }

  revalidateFinancePaths();
  return { success: "Fechamento de caixa registrado." };
}

export async function reopenCashClosingAction(closingId: string): Promise<FinanceActionState> {
  if (!isValidUuid(closingId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requireCompanyContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("reopen_cash_closing", {
    p_closing_id: closingId,
  });

  if (error || !data) {
    return { error: mapFinanceError(error?.message) };
  }

  revalidateFinancePaths();
  return { success: "Fechamento reaberto." };
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
