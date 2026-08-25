import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import {
  emptyCashMethodTotals,
  type CashMethodTotals,
} from "@/features/pos/balance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/types/database.types";

export type CashSessionView = {
  id: string;
  status: "open" | "closed";
  openedAt: string;
  openedBy: string;
  openingBalanceCents: number;
  closedAt: string | null;
  closedBy: string | null;
  countedCashCents: number | null;
  expectedCashCents: number | null;
  differenceCents: number | null;
  notes: string | null;
  summary: CashMethodTotals | null;
};

export type OpenCashPreview = {
  session: CashSessionView;
  methodTotals: CashMethodTotals;
  expectedCashCents: number;
};

function mapSummary(raw: unknown): CashMethodTotals | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const totals = emptyCashMethodTotals();
  for (const method of Object.keys(totals) as PaymentMethod[]) {
    const value = record[method];
    totals[method] = typeof value === "number" ? value : 0;
  }
  return totals;
}

function mapSession(row: {
  id: string;
  status: string;
  opened_at: string;
  opened_by: string;
  opening_balance_cents: number;
  closed_at: string | null;
  closed_by: string | null;
  counted_cash_cents: number | null;
  expected_cash_cents: number | null;
  difference_cents: number | null;
  notes: string | null;
  summary: unknown;
}): CashSessionView {
  return {
    id: row.id,
    status: row.status === "closed" ? "closed" : "open",
    openedAt: row.opened_at,
    openedBy: row.opened_by,
    openingBalanceCents: row.opening_balance_cents,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    countedCashCents: row.counted_cash_cents,
    expectedCashCents: row.expected_cash_cents,
    differenceCents: row.difference_cents,
    notes: row.notes,
    summary: mapSummary(row.summary),
  };
}

export async function getOpenCashSession(
  companyId: string,
): Promise<CashSessionView | null> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "open")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapSession(data);
}

export async function listRecentCashSessions(
  companyId: string,
  limit = 10,
): Promise<CashSessionView[]> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("company_id", companyId)
    .order("opened_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map(mapSession);
}

/** Totais por método desde a abertura (pagamentos de vendas no período). */
export async function getCashSessionPaymentTotals(
  companyId: string,
  openedAt: string,
): Promise<CashMethodTotals> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const totals = emptyCashMethodTotals();

  const { data, error } = await supabase
    .from("financial_payments")
    .select("amount_cents, payment_method, financial_entries!inner(source_type, company_id)")
    .eq("company_id", companyId)
    .is("cancelled_at", null)
    .gte("paid_at", openedAt)
    .eq("financial_entries.source_type", "sale");

  if (error || !data) {
    return totals;
  }

  for (const row of data) {
    const method = row.payment_method as PaymentMethod;
    if (method in totals) {
      totals[method] += row.amount_cents;
    } else {
      totals.other += row.amount_cents;
    }
  }

  return totals;
}

export async function getOpenCashPreview(
  companyId: string,
): Promise<OpenCashPreview | null> {
  const session = await getOpenCashSession(companyId);
  if (!session) {
    return null;
  }

  const methodTotals = await getCashSessionPaymentTotals(companyId, session.openedAt);
  const expectedCashCents = session.openingBalanceCents + methodTotals.cash;

  return { session, methodTotals, expectedCashCents };
}
