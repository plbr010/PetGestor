import type {
  AdminAccountStatus,
  AdminAccountStatusFilter,
  AdminCompanyListItem,
  AdminDashboardSummary,
} from "@/features/admin/types";
import type { EntitlementState } from "@/features/subscription/types";

export function mapEntitlementToAdminStatus(
  state: EntitlementState,
): AdminAccountStatus {
  switch (state) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "cancelled":
      return "cancelled";
    case "trial_expired":
      return "blocked";
    default:
      return "blocked";
  }
}

export function adminStatusLabel(status: AdminAccountStatus): string {
  switch (status) {
    case "trial":
      return "TRIAL";
    case "active":
      return "ATIVO";
    case "past_due":
      return "INADIMPLENTE";
    case "cancelled":
      return "CANCELADO";
    case "blocked":
      return "EXPIRADO/BLOQUEADO";
    default:
      return status;
  }
}

/** Formata tempo de trial a partir dos timestamps existentes (sem nova regra). */
export function formatAdminTrialRemaining(
  trialEndsAt: string,
  serverNow: Date,
): string {
  const endsMs = new Date(trialEndsAt).getTime();
  const nowMs = serverNow.getTime();
  const diffMs = endsMs - nowMs;

  if (diffMs >= 0) {
    const totalHours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    if (days > 0) {
      return `${days}d ${hours}h restantes`;
    }

    const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
    if (totalHours > 0) {
      return `${totalHours}h ${String(minutes).padStart(2, "0")}min restantes`;
    }

    return `${Math.max(minutes, 0)}min restantes`;
  }

  const expiredMs = Math.abs(diffMs);
  const totalHours = Math.floor(expiredMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return `Expirado há ${days}d ${hours}h`;
  }

  if (totalHours > 0) {
    return `Expirado há ${totalHours}h`;
  }

  const minutes = Math.floor((expiredMs % 3_600_000) / 60_000);
  return `Expirado há ${Math.max(minutes, 1)}min`;
}

export function formatAdminDateTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatAdminCurrencyFromCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function matchesAdminFilters(
  item: AdminCompanyListItem,
  query: string,
  status: AdminAccountStatusFilter,
): boolean {
  if (status !== "all" && item.accountStatus !== status) {
    return false;
  }

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [item.companyName, item.ownerName ?? "", item.ownerEmail ?? ""]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function buildAdminSummary(items: AdminCompanyListItem[]): AdminDashboardSummary {
  const summary: AdminDashboardSummary = {
    totalAccounts: items.length,
    trialCount: 0,
    activeCount: 0,
    pastDueCount: 0,
    cancelledCount: 0,
    blockedCount: 0,
    estimatedMrrCents: 0,
  };

  for (const item of items) {
    switch (item.accountStatus) {
      case "trial":
        summary.trialCount += 1;
        break;
      case "active":
        summary.activeCount += 1;
        summary.estimatedMrrCents += item.monthlyPriceCents;
        break;
      case "past_due":
        summary.pastDueCount += 1;
        break;
      case "cancelled":
        summary.cancelledCount += 1;
        break;
      case "blocked":
        summary.blockedCount += 1;
        break;
    }
  }

  return summary;
}
