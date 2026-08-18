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
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { FinanceSummaryCard } from "@/components/dashboard/finance-summary-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RecentClientsList } from "@/components/dashboard/recent-clients-list";
import { DashboardScheduleList } from "@/components/dashboard/dashboard-schedule-list";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  countAppointmentsForDay,
  getAppointmentsForDay,
  getUpcomingAppointments,
} from "@/features/appointments/queries";
import { countActiveCustomers } from "@/features/customers/queries";
import { countActivePets } from "@/features/pets/queries";
import { countActiveEmployees } from "@/features/employees/queries";
import { countActiveServices } from "@/features/services/queries";
import { getDashboardFinanceMetrics } from "@/features/finance/queries";
import { formatAmountCents } from "@/features/finance/utils";
import { InventoryDashboardCard } from "@/features/inventory/components/inventory-dashboard-card";
import { getInventoryDashboardAlerts } from "@/features/inventory/queries";
import { PosDashboardCard } from "@/features/pos/components/pos-dashboard-card";
import { getPosDashboardMetrics } from "@/features/pos/queries";
import { requireCompany } from "@/features/companies/queries";
import { countServiceOrdersByStatus } from "@/features/service-orders/queries";
import { requireUser } from "@/lib/auth/require-user";
import { getTodayInTimezone } from "@/lib/timezone";

export default async function DashboardHomePage() {
  const user = await requireUser();
  const context = await requireCompany(user.id);
  const timeZone = context.membership.company.timezone;
  const today = getTodayInTimezone(timeZone);

  const [
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
  ] = await Promise.all([
    countActiveCustomers(context.membership.company.id),
    countActivePets(context.membership.company.id),
    countActiveServices(context.membership.company.id),
    countActiveEmployees(context.membership.company.id),
    countAppointmentsForDay(context.membership.company.id, today, timeZone),
    getAppointmentsForDay(context.membership.company.id, today, timeZone),
    getUpcomingAppointments(context.membership.company.id, 5),
    countServiceOrdersByStatus(context.membership.company.id, "waiting", today, timeZone),
    countServiceOrdersByStatus(context.membership.company.id, "in_progress", today, timeZone),
    countServiceOrdersByStatus(context.membership.company.id, "ready", today, timeZone),
    getDashboardFinanceMetrics(context.membership.company.id, timeZone),
    getInventoryDashboardAlerts(context.membership.company.id),
    getPosDashboardMetrics(context.membership.company.id, timeZone),
  ]);

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
    {
      id: "revenue-today",
      label: "Recebido hoje",
      value: formatAmountCents(financeMetrics.incomePaidTodayCents),
      change: "Receitas pagas hoje",
      trend: "up" as const,
      icon: CircleDollarSign,
    },
  ];

  return (
    <>
      <DashboardHeader
        title="Visão geral"
        description="resumo do pet shop"
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <DemoNotice />

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

        <InventoryDashboardCard
          lowStockCount={inventoryAlerts.lowStockCount}
          outOfStockCount={inventoryAlerts.outOfStockCount}
        />

        <PosDashboardCard metrics={posMetrics} />

        <div className="grid gap-6 xl:grid-cols-2">
          <DashboardScheduleList appointments={todayAppointments} timeZone={timeZone} />
          <DashboardAppointmentsList appointments={upcomingAppointments} timeZone={timeZone} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <FinanceSummaryCard
            incomePaidTodayCents={financeMetrics.incomePaidTodayCents}
            pendingReceivablesCents={financeMetrics.pendingReceivablesCents}
            expensePaidMonthCents={financeMetrics.expensePaidMonthCents}
            realizedResultMonthCents={financeMetrics.realizedResultMonthCents}
            monthlySummary={financeMetrics.monthlySummary}
          />
          <RecentClientsList />
        </div>
      </main>
    </>
  );
}
