import {
  incomeOriginLabel,
  normalizeExpenseCategory,
} from "@/features/finance/analytics/constants";
import {
  bucketKeyForDate,
  bucketLabel,
  chooseEvolutionGranularity,
  periodDayCount,
} from "@/features/finance/analytics/period";
import type {
  AnalyticsEntryRow,
  AnalyticsPaymentRow,
  FinanceAnalytics,
  FinanceAnalyticsPreset,
  FinanceAnalyticsRawData,
  FinanceBreakdownItem,
  FinanceRankingItem,
} from "@/features/finance/analytics/types";
import { addDaysToDateString, resolveCompanyTimeZone } from "@/lib/timezone";
import type { FinancialSourceType } from "@/types/database.types";

function isCancelled(entry: AnalyticsEntryRow): boolean {
  return entry.status === "cancelled";
}

function isInPeriod(iso: string, startIso: string, endIso: string): boolean {
  return iso >= startIso && iso < endIso;
}

function dateFromIso(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveCompanyTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function paymentsForEntry(entryId: string, payments: AnalyticsPaymentRow[]): AnalyticsPaymentRow[] {
  return payments.filter((payment) => payment.entryId === entryId);
}

function receivedInPeriodForEntry(
  entry: AnalyticsEntryRow,
  payments: AnalyticsPaymentRow[],
  startIso: string,
  endIso: string,
): number {
  const entryPayments = paymentsForEntry(entry.id, payments);
  const fromPayments = entryPayments
    .filter((payment) => isInPeriod(payment.paidAt, startIso, endIso))
    .reduce((sum, payment) => sum + payment.amountCents, 0);

  if (fromPayments > 0) {
    return fromPayments;
  }

  if (
    entry.entryType === "income" &&
    entry.status === "paid" &&
    entry.paidAt &&
    isInPeriod(entry.paidAt, startIso, endIso)
  ) {
    return entry.amountCents;
  }

  return 0;
}

function totalReceivedOnEntry(
  entry: AnalyticsEntryRow,
  payments: AnalyticsPaymentRow[],
): number {
  const fromPayments = paymentsForEntry(entry.id, payments).reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  );

  if (fromPayments > 0) {
    return fromPayments;
  }

  if (entry.status === "paid") {
    return entry.amountCents;
  }

  return 0;
}

function buildBreakdown(
  items: Map<string, { label: string; cents: number; entryIds: Set<string> }>,
): FinanceBreakdownItem[] {
  const total = [...items.values()].reduce((sum, item) => sum + item.cents, 0);

  return [...items.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      cents: value.cents,
      percent: total > 0 ? (value.cents / total) * 100 : 0,
      entryIds: [...value.entryIds],
    }))
    .sort((a, b) => b.cents - a.cents);
}

function incomeDetailLabel(entry: AnalyticsEntryRow): string {
  if (entry.detailLabel) {
    return entry.detailLabel;
  }

  if (entry.sourceType === "manual" && entry.category) {
    return entry.category;
  }

  return entry.description;
}

function addRanking(
  map: Map<string, { label: string; cents: number; entryIds: Set<string> }>,
  label: string,
  cents: number,
  entryId: string,
) {
  const key = label.toLowerCase();
  const current = map.get(key) ?? { label, cents: 0, entryIds: new Set<string>() };
  current.cents += cents;
  current.entryIds.add(entryId);
  map.set(key, current);
}

export function buildFinancialAnalytics(
  raw: FinanceAnalyticsRawData,
  period: { from: string; to: string; preset: FinanceAnalyticsPreset },
  timeZone: string,
): FinanceAnalytics {
  const { entries, payments, saleItems, periodStartIso, periodEndIso } = raw;
  const activeEntries = entries.filter((entry) => !isCancelled(entry));

  let incomeReceivedCents = 0;
  let expensePaidCents = 0;
  let generatedCents = 0;
  let receivedFromGeneratedCents = 0;

  const incomeOriginMap = new Map<
    string,
    { label: string; cents: number; entryIds: Set<string> }
  >();
  const expenseCategoryMap = new Map<
    string,
    { label: string; cents: number; entryIds: Set<string> }
  >();
  const topIncomeMap = new Map<
    string,
    { label: string; cents: number; entryIds: Set<string> }
  >();
  const topExpenseMap = new Map<
    string,
    { label: string; cents: number; entryIds: Set<string> }
  >();

  const dayCount = periodDayCount(period.from, period.to);
  const granularity = chooseEvolutionGranularity(dayCount);
  const evolutionMap = new Map<
    string,
    { incomeCents: number; expenseCents: number }
  >();

  for (const entry of activeEntries) {
    const createdInPeriod = isInPeriod(entry.createdAt, periodStartIso, periodEndIso);
    const receivedInPeriod = receivedInPeriodForEntry(
      entry,
      payments,
      periodStartIso,
      periodEndIso,
    );

    if (entry.entryType === "income") {
      if (createdInPeriod) {
        generatedCents += entry.amountCents;
        receivedFromGeneratedCents += Math.min(
          entry.amountCents,
          totalReceivedOnEntry(entry, payments),
        );
      }

      if (receivedInPeriod > 0) {
        incomeReceivedCents += receivedInPeriod;

        const originKey = entry.sourceType;
        const origin = incomeOriginMap.get(originKey) ?? {
          label: incomeOriginLabel(entry.sourceType),
          cents: 0,
          entryIds: new Set<string>(),
        };
        origin.cents += receivedInPeriod;
        origin.entryIds.add(entry.id);
        incomeOriginMap.set(originKey, origin);

        if (entry.sourceType !== "sale") {
          addRanking(
            topIncomeMap,
            incomeDetailLabel(entry),
            receivedInPeriod,
            entry.id,
          );
        }

        const paidAt =
          paymentsForEntry(entry.id, payments).find((payment) =>
            isInPeriod(payment.paidAt, periodStartIso, periodEndIso),
          )?.paidAt ?? entry.paidAt;

        if (paidAt) {
          const bucket = bucketKeyForDate(dateFromIso(paidAt, timeZone), granularity);
          const current = evolutionMap.get(bucket) ?? { incomeCents: 0, expenseCents: 0 };
          current.incomeCents += receivedInPeriod;
          evolutionMap.set(bucket, current);
        }
      }
    } else if (
      entry.status === "paid" &&
      entry.paidAt &&
      isInPeriod(entry.paidAt, periodStartIso, periodEndIso)
    ) {
      expensePaidCents += entry.amountCents;

      const category = normalizeExpenseCategory(entry.category);
      const bucketItem = expenseCategoryMap.get(category) ?? {
        label: category,
        cents: 0,
        entryIds: new Set<string>(),
      };
      bucketItem.cents += entry.amountCents;
      bucketItem.entryIds.add(entry.id);
      expenseCategoryMap.set(category, bucketItem);

      addRanking(
        topExpenseMap,
        entry.description || category,
        entry.amountCents,
        entry.id,
      );

      const bucket = bucketKeyForDate(dateFromIso(entry.paidAt, timeZone), granularity);
      const current = evolutionMap.get(bucket) ?? { incomeCents: 0, expenseCents: 0 };
      current.expenseCents += entry.amountCents;
      evolutionMap.set(bucket, current);
    }
  }

  const netResultCents = incomeReceivedCents - expensePaidCents;
  const marginPercent =
    incomeReceivedCents > 0 ? (netResultCents / incomeReceivedCents) * 100 : null;

  const pendingCents = Math.max(0, generatedCents - receivedFromGeneratedCents);

  const evolution: FinanceAnalytics["evolution"] = [];
  let cursor = period.from;
  while (cursor <= period.to) {
    const key = bucketKeyForDate(cursor, granularity);
    if (!evolution.some((item) => item.key === key)) {
      const values = evolutionMap.get(key) ?? { incomeCents: 0, expenseCents: 0 };
      evolution.push({
        key,
        label: bucketLabel(key, granularity),
        incomeCents: values.incomeCents,
        expenseCents: values.expenseCents,
        resultCents: values.incomeCents - values.expenseCents,
      });
    }

    if (granularity === "day") {
      cursor = addDaysToDateString(cursor, 1);
    } else if (granularity === "week") {
      cursor = addDaysToDateString(cursor, 7);
    } else {
      const [year, month] = cursor.split("-").map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      cursor = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
    }
  }

  const saleIdsWithRevenue = new Set(
    activeEntries
      .filter((entry) => entry.sourceType === "sale" && entry.saleId)
      .map((entry) => entry.saleId as string),
  );

  let pdvRevenueCents = 0;
  let pdvCostCents = 0;

  for (const item of saleItems) {
    if (!saleIdsWithRevenue.has(item.saleId)) {
      continue;
    }

    const entry = activeEntries.find(
      (row) => row.saleId === item.saleId && row.sourceType === "sale",
    );
    if (!entry) {
      continue;
    }

    const received = receivedInPeriodForEntry(
      entry,
      payments,
      periodStartIso,
      periodEndIso,
    );
    if (received <= 0 || entry.amountCents <= 0) {
      continue;
    }

    const ratio = Math.min(1, received / entry.amountCents);
    const productShare = Math.round(item.totalCents * ratio);
    pdvRevenueCents += productShare;
    pdvCostCents += Math.round(item.costCents * ratio);

    if (productShare > 0) {
      addRanking(topIncomeMap, item.productName, productShare, entry.id);
    }
  }

  const profitByOrigin: FinanceAnalytics["profitByOrigin"] = [];

  if (pdvRevenueCents > 0) {
    profitByOrigin.push({
      originKey: "sale",
      originLabel: incomeOriginLabel("sale"),
      revenueCents: pdvRevenueCents,
      costCents: pdvCostCents,
      grossProfitCents: pdvRevenueCents - pdvCostCents,
    });
  }

  const topIncomeSources: FinanceRankingItem[] = buildBreakdown(topIncomeMap).map(
    (item, index) => ({
      rank: index + 1,
      label: item.label,
      cents: item.cents,
      entryIds: item.entryIds,
    }),
  );

  const topExpenses: FinanceRankingItem[] = buildBreakdown(topExpenseMap).map(
    (item, index) => ({
      rank: index + 1,
      label: item.label,
      cents: item.cents,
      entryIds: item.entryIds,
    }),
  );

  const hasData =
    incomeReceivedCents > 0 ||
    expensePaidCents > 0 ||
    generatedCents > 0 ||
    activeEntries.length > 0;

  return {
    period,
    hasData,
    kpis: {
      incomeReceivedCents,
      expensePaidCents,
      netResultCents,
      marginPercent,
    },
    cashFlow: {
      generatedCents,
      receivedCents: incomeReceivedCents,
      pendingCents,
    },
    incomeByOrigin: buildBreakdown(incomeOriginMap),
    expenseByCategory: buildBreakdown(expenseCategoryMap),
    evolution,
    topIncomeSources: topIncomeSources.slice(0, 8),
    topExpenses: topExpenses.slice(0, 8),
    profitByOrigin,
  };
}

export function sumBreakdownCents(items: FinanceBreakdownItem[]): number {
  return items.reduce((sum, item) => sum + item.cents, 0);
}

export function filterEntriesByOrigin(
  sourceType: FinancialSourceType,
  entries: AnalyticsEntryRow[],
): AnalyticsEntryRow[] {
  return entries.filter((entry) => entry.sourceType === sourceType && !isCancelled(entry));
}

export function filterEntriesByExpenseCategory(
  category: string,
  entries: AnalyticsEntryRow[],
): AnalyticsEntryRow[] {
  return entries.filter(
    (entry) =>
      entry.entryType === "expense" &&
      !isCancelled(entry) &&
      normalizeExpenseCategory(entry.category) === category,
  );
}
