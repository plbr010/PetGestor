import { CashClosingDateNav } from "@/features/finance/components/cash-closing-date-nav";
import { CashClosingPanel } from "@/features/finance/components/cash-closing-panel";
import {
  getCashClosingForDate,
  getDailyCashSummary,
} from "@/features/finance/payments/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { getTodayInTimezone } from "@/lib/timezone";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ButtonLink } from "@/components/ui/button-link";

type CashClosingPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function CashClosingPage({ searchParams }: CashClosingPageProps) {
  const context = await requireCompanyContext();
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const today = getTodayInTimezone(timeZone);
  const businessDate =
    query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : today;

  const companyId = context.membership.company.id;
  const role = context.membership.role;
  const canReopen = role === "owner" || role === "admin";

  const [summary, closing] = await Promise.all([
    getDailyCashSummary(companyId, businessDate, timeZone),
    getCashClosingForDate(companyId, businessDate),
  ]);

  return (
    <>
      <DashboardHeader
        title="Fechamento de caixa"
        description="Resumo diário de recebimentos, despesas e conferência de dinheiro."
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CashClosingDateNav selectedDate={businessDate} timeZone={timeZone} />
          <ButtonLink href="/dashboard/financeiro" variant="outline" size="sm">
            Voltar ao financeiro
          </ButtonLink>
        </div>

        <CashClosingPanel
          businessDate={businessDate}
          summary={summary}
          closing={closing}
          canReopen={canReopen}
        />
      </main>
    </>
  );
}
