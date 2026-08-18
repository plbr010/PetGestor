import {
  getAppointmentsForDay,
  getUpcomingAppointments,
  countAppointmentsForDay,
} from "@/features/appointments/queries";
import type { AppointmentListItem } from "@/features/appointments/types";
import { countActiveCustomers } from "@/features/customers/queries";
import { countActivePets } from "@/features/pets/queries";
import { countActiveEmployees } from "@/features/employees/queries";
import { countActiveServices } from "@/features/services/queries";
import { getDashboardFinanceMetrics } from "@/features/finance/queries";
import type { FinancialSummary } from "@/features/finance/types";
import { getInventoryDashboardAlerts } from "@/features/inventory/queries";
import type { InventoryDashboardAlert } from "@/features/inventory/types";
import { getPosDashboardMetrics } from "@/features/pos/queries";
import type { PosDashboardMetrics } from "@/features/pos/types";
import { countServiceOrdersByStatus } from "@/features/service-orders/queries";
import type { ServiceOrderStatus } from "@/types/database.types";

const EMPTY_FINANCIAL_SUMMARY: FinancialSummary = {
  incomePaidCents: 0,
  incomePendingCents: 0,
  expensePaidCents: 0,
  expensePendingCents: 0,
  realizedResultCents: 0,
  projectedResultCents: 0,
};

const EMPTY_POS_METRICS: PosDashboardMetrics = {
  salesCountToday: 0,
  totalSoldTodayCents: 0,
  productsSoldToday: 0,
};

const EMPTY_INVENTORY_ALERTS: InventoryDashboardAlert = {
  lowStockCount: 0,
  outOfStockCount: 0,
};

export type DashboardHomeData = {
  customersCount: number;
  petsCount: number;
  servicesCount: number;
  employeesCount: number;
  appointmentsTodayCount: number;
  todayAppointments: AppointmentListItem[];
  upcomingAppointments: AppointmentListItem[];
  waitingCount: number;
  inProgressCount: number;
  readyCount: number;
  financeMetrics: {
    incomePaidTodayCents: number;
    pendingReceivablesCents: number;
    expensePaidMonthCents: number;
    realizedResultMonthCents: number;
    monthlySummary: FinancialSummary;
  };
  inventoryAlerts: InventoryDashboardAlert;
  posMetrics: PosDashboardMetrics;
  partialErrors: string[];
};

async function safeCount(
  label: string,
  fn: () => Promise<number>,
  partialErrors: string[],
): Promise<number> {
  try {
    return await fn();
  } catch (error) {
    partialErrors.push(label);
    console.error(`[dashboard:${label}]`, error);
    return 0;
  }
}

async function safeList<T>(
  label: string,
  fn: () => Promise<T[]>,
  partialErrors: string[],
): Promise<T[]> {
  try {
    return await fn();
  } catch (error) {
    partialErrors.push(label);
    console.error(`[dashboard:${label}]`, error);
    return [];
  }
}

async function safeValue<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  partialErrors: string[],
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    partialErrors.push(label);
    console.error(`[dashboard:${label}]`, error);
    return fallback;
  }
}

export async function loadDashboardHomeData(
  companyId: string,
  timeZone: string,
  today: string,
): Promise<DashboardHomeData> {
  const partialErrors: string[] = [];

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
    safeCount("customers", () => countActiveCustomers(companyId), partialErrors),
    safeCount("pets", () => countActivePets(companyId), partialErrors),
    safeCount("services", () => countActiveServices(companyId), partialErrors),
    safeCount("employees", () => countActiveEmployees(companyId), partialErrors),
    safeCount(
      "appointments-count",
      () => countAppointmentsForDay(companyId, today, timeZone),
      partialErrors,
    ),
    safeList(
      "appointments-today",
      () => getAppointmentsForDay(companyId, today, timeZone),
      partialErrors,
    ),
    safeList(
      "appointments-upcoming",
      () => getUpcomingAppointments(companyId, 5),
      partialErrors,
    ),
    safeCount(
      "orders-waiting",
      () =>
        countServiceOrdersByStatus(
          companyId,
          "waiting" as ServiceOrderStatus,
          today,
          timeZone,
        ),
      partialErrors,
    ),
    safeCount(
      "orders-in-progress",
      () =>
        countServiceOrdersByStatus(
          companyId,
          "in_progress" as ServiceOrderStatus,
          today,
          timeZone,
        ),
      partialErrors,
    ),
    safeCount(
      "orders-ready",
      () =>
        countServiceOrdersByStatus(
          companyId,
          "ready" as ServiceOrderStatus,
          today,
          timeZone,
        ),
      partialErrors,
    ),
    safeValue(
      "finance",
      () => getDashboardFinanceMetrics(companyId, timeZone),
      {
        incomePaidTodayCents: 0,
        pendingReceivablesCents: 0,
        expensePaidMonthCents: 0,
        realizedResultMonthCents: 0,
        monthlySummary: EMPTY_FINANCIAL_SUMMARY,
      },
      partialErrors,
    ),
    safeValue(
      "inventory",
      () => getInventoryDashboardAlerts(companyId),
      EMPTY_INVENTORY_ALERTS,
      partialErrors,
    ),
    safeValue(
      "pos",
      () => getPosDashboardMetrics(companyId, timeZone),
      EMPTY_POS_METRICS,
      partialErrors,
    ),
  ]);

  return {
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
  };
}
