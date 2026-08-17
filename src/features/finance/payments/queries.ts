import { unstable_noStore as noStore } from "next/cache";

import type {
  CashClosingRecord,
  DailyCashSummary,
  FinancialPaymentRecord,
} from "@/features/finance/payments/types";
import {
  aggregatePaymentsByMethod,
  computeExpectedCashCents,
  emptyPaymentMethodTotals,
  sumPaymentMethodTotals,
} from "@/features/finance/payments/utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, localDateTimeToUtcIso } from "@/lib/timezone";
import { isValidUuid } from "@/lib/security/uuid";
import type { PaymentMethod } from "@/types/database.types";

function mapPaymentRow(row: Record<string, unknown>): FinancialPaymentRecord {
  return {
    id: String(row.id),
    financial_entry_id: String(row.financial_entry_id),
    amount_cents: Number(row.amount_cents),
    payment_method: row.payment_method as PaymentMethod,
    paid_at: String(row.paid_at),
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    cancelled_at: (row.cancelled_at as string | null) ?? null,
  };
}

function getBusinessDayBounds(date: string, timeZone: string) {
  const start = localDateTimeToUtcIso(date, "00:00", timeZone);
  const end = localDateTimeToUtcIso(addDaysToDateString(date, 1), "00:00", timeZone);
  return { start, end };
}

export async function getPaymentsForEntry(
  companyId: string,
  entryId: string,
): Promise<FinancialPaymentRecord[]> {
  if (!isValidUuid(companyId) || !isValidUuid(entryId)) {
    return [];
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("financial_payments")
    .select(
      "id, financial_entry_id, amount_cents, payment_method, paid_at, notes, created_at, cancelled_at",
    )
    .eq("company_id", companyId)
    .eq("financial_entry_id", entryId)
    .order("paid_at", { ascending: false });

  return (data ?? []).map((row) => mapPaymentRow(row as unknown as Record<string, unknown>));
}

export async function getDailyCashSummary(
  companyId: string,
  businessDate: string,
  timeZone: string,
  openingBalanceCents = 0,
): Promise<DailyCashSummary> {
  if (!isValidUuid(companyId) || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return {
      totalReceivedCents: 0,
      byMethod: emptyPaymentMethodTotals(),
      expensePaidCents: 0,
      netBalanceCents: 0,
      expectedCashCents: openingBalanceCents,
    };
  }

  noStore();
  const supabase = await createSupabaseServerClient();
  const { start, end } = getBusinessDayBounds(businessDate, timeZone);

  const { data } = await supabase
    .from("financial_payments")
    .select("amount_cents, payment_method, cancelled_at, financial_entries!inner(entry_type)")
    .eq("company_id", companyId)
    .is("cancelled_at", null)
    .gte("paid_at", start)
    .lt("paid_at", end);

  const incomePayments: FinancialPaymentRecord[] = [];
  const expensePayments: FinancialPaymentRecord[] = [];

  for (const row of data ?? []) {
    const entryType = (row.financial_entries as { entry_type: string }).entry_type;
    const payment = mapPaymentRow({
      ...row,
      id: "summary",
      financial_entry_id: "summary",
      paid_at: start,
      notes: null,
      created_at: start,
    });

    if (entryType === "income") {
      incomePayments.push(payment);
    } else if (entryType === "expense") {
      expensePayments.push(payment);
    }
  }

  const byMethod = aggregatePaymentsByMethod(incomePayments);
  const totalReceivedCents = sumPaymentMethodTotals(byMethod);
  const expensePaidCents = expensePayments.reduce((sum, p) => sum + p.amount_cents, 0);

  return {
    totalReceivedCents,
    byMethod,
    expensePaidCents,
    netBalanceCents: totalReceivedCents - expensePaidCents,
    expectedCashCents: computeExpectedCashCents(openingBalanceCents, byMethod.cash),
  };
}

export async function getCashClosingForDate(
  companyId: string,
  businessDate: string,
): Promise<CashClosingRecord | null> {
  if (!isValidUuid(companyId) || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return null;
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("cash_closings")
    .select("*")
    .eq("company_id", companyId)
    .eq("business_date", businessDate)
    .is("reopened_at", null)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return data as CashClosingRecord;
}

export async function getReceivedTodayCents(
  companyId: string,
  businessDate: string,
  timeZone: string,
): Promise<number> {
  const summary = await getDailyCashSummary(companyId, businessDate, timeZone);
  return summary.totalReceivedCents;
}

export async function getOutstandingReceivablesCents(companyId: string): Promise<number> {
  if (!isValidUuid(companyId)) {
    return 0;
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data: entries } = await supabase
    .from("financial_entries")
    .select("id, amount_cents")
    .eq("company_id", companyId)
    .eq("entry_type", "income")
    .in("status", ["pending", "partially_paid"])
    .is("deleted_at", null);

  if (!entries?.length) {
    return 0;
  }

  const entryIds = entries.map((entry) => entry.id);
  const { data: payments } = await supabase
    .from("financial_payments")
    .select("financial_entry_id, amount_cents")
    .eq("company_id", companyId)
    .in("financial_entry_id", entryIds)
    .is("cancelled_at", null);

  const paidByEntry = new Map<string, number>();
  for (const payment of payments ?? []) {
    paidByEntry.set(
      payment.financial_entry_id,
      (paidByEntry.get(payment.financial_entry_id) ?? 0) + payment.amount_cents,
    );
  }

  return entries.reduce((sum, entry) => {
    const paid = paidByEntry.get(entry.id) ?? 0;
    return sum + Math.max(entry.amount_cents - paid, 0);
  }, 0);
}
