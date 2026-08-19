import {
  CalendarCheck,
  CircleDollarSign,
  ClipboardList,
  Clock,
  PawPrint,
  Scissors,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

import { DashboardAppointmentsList } from "@/components/dashboard/dashboard-appointments-list";
import { FinanceSummaryCard } from "@/components/dashboard/finance-summary-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RecentClientsList } from "@/components/dashboard/recent-clients-list";
import { DashboardScheduleList } from "@/components/dashboard/dashboard-schedule-list";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { loadDashboardHomeData } from "@/features/dashboard/load-home-data";
import { getRecentCustomers } from "@/features/customers/queries";
import { requireCompany } from "@/features/companies/queries";
import { formatAmountCents } from "@/features/finance/utils";
import { InventoryDashboardCard } from "@/features/inventory/components/inventory-dashboard-card";
import { PosDashboardCard } from "@/features/pos/components/pos-dashboard-card";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDashboardPartialErrors } from "@/features/dashboard/partial-errors";
import { requireUser } from "@/lib/auth/require-user";
import { getTodayInTimezone } from "@/lib/timezone";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ "convite-aceito"?: string }>;
}) {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  const query = await searchParams;
  const justAcceptedInvite = query["convite-aceito"] === "1";
  const timeZone = context.membership.company.timezone;
  const today = getTodayInTimezone(timeZone);

  const [
    homeData,
    recentCustomers,
  ] = await Promise.all([
    loadDashboardHomeData(
      context.membership.company.id,
      timeZone,
      today,
      context.membership,
    ),
    getRecentCustomers(context.membership.company.id, 5),
  ]);

  const {
    customersCount,
    petsCount,
    servicesCount,
    employeesCount,
    appointmentsTodayCount,
    todayAppointments,
    upcomingAppointments,
    waitingCount,
    inProgressCount,
    readyCount,
    financeMetrics,
    inventoryAlerts,
    posMetrics,
    partialErrors,
  } = homeData;

  const partialErrorMessage = formatDashboardPartialErrors(partialErrors);

  const canViewFinance = hasPermission(context.membership, "finance.view");
  const canViewInventory = hasPermission(context.membership, "inventory.view");
  const canViewPos = hasPermission(context.membership, "pos.use");

  const stats = [
    {
      id: "appointments-today",
      label: "Agendamentos hoje",
      value: String(appointmentsTodayCount),
      change: "Total ativo hoje",
      trend: "neutral" as const,
      icon: CalendarCheck,
    },
    {
      id: "waiting-orders",
      label: "Aguardando",
      value: String(waitingCount),
      change: "Atendimentos de hoje",
      trend: "neutral" as const,
      icon: Clock,
    },
    {
      id: "in-progress-orders",
      label: "Em atendimento",
      value: String(inProgressCount),
      change: "Atendimentos de hoje",
      trend: "neutral" as const,
      icon: ClipboardList,
    },
    {
      id: "ready-orders",
      label: "Prontos para buscar",
      value: String(readyCount),
      change: "Atendimentos de hoje",
      trend: "neutral" as const,
      icon: Users,
    },
    {
      id: "new-clients",
      label: "Tutores cadastrados",
      value: String(customersCount),
      change: "Total ativo",
      trend: "up" as const,
      icon: UserPlus,
    },
    {
      id: "pets-count",
      label: "Pets cadastrados",
      value: String(petsCount),
      change: "Total ativo",
      trend: "up" as const,
      icon: PawPrint,
    },
    {
      id: "services-count",
      label: "Serviços ativos",
      value: String(servicesCount),
      change: "Total ativo",
      trend: "up" as const,
      icon: Scissors,
    },
    {
      id: "employees-count",
      label: "Funcionários ativos",
      value: String(employeesCount),
      change: "Total ativo",
      trend: "up" as const,
      icon: UserCog,
    },
    ...(canViewFinance
      ? [
          {
            id: "revenue-today",
            label: "Recebido hoje",
            value: formatAmountCents(financeMetrics.incomePaidTodayCents),
            change: "Receitas pagas hoje",
            trend: "up" as const,
            icon: CircleDollarSign,
          },
        ]
      : []),
  ];

  return (
    <>
      <DashboardHeader
        title="Visão geral"
        description="resumo do pet shop"
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {justAcceptedInvite ? (
          <FormFeedback
            message={`Bem-vindo(a) à ${context.membership.company.name}! Seu acesso foi configurado automaticamente.`}
            variant="success"
          />
        ) : null}

        {partialErrorMessage ? (
          <FormFeedback message={partialErrorMessage} variant="error" />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {stats.map((stat) => (
            <MetricCard
              key={stat.id}
              label={stat.label}
              value={stat.value}
              change={stat.change}
              trend={stat.trend}
              icon={stat.icon}
            />
          ))}
        </div>

        {canViewInventory ? (
          <InventoryDashboardCard
            lowStockCount={inventoryAlerts.lowStockCount}
            outOfStockCount={inventoryAlerts.outOfStockCount}
          />
        ) : null}

        {canViewPos ? <PosDashboardCard metrics={posMetrics} /> : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <DashboardScheduleList appointments={todayAppointments} timeZone={timeZone} />
          <DashboardAppointmentsList appointments={upcomingAppointments} timeZone={timeZone} />
        </div>

        {canViewFinance ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <FinanceSummaryCard
              incomePaidTodayCents={financeMetrics.incomePaidTodayCents}
              pendingReceivablesCents={financeMetrics.pendingReceivablesCents}
              expensePaidMonthCents={financeMetrics.expensePaidMonthCents}
              realizedResultMonthCents={financeMetrics.realizedResultMonthCents}
              monthlySummary={financeMetrics.monthlySummary}
            />
            <RecentClientsList customers={recentCustomers} />
          </div>
        ) : (
          <RecentClientsList customers={recentCustomers} />
        )}
      </main>
    </>
  );
}
