export type ReportPeriod = { from: string; to: string; preset: string };

export type ReportOverview = {
  period: ReportPeriod;
  prev: ReportPeriod | null;
  revenueCents: number;
  prevRevenueCents: number | null;
  incomeReceivedCents: number;
  prevIncomeReceivedCents: number | null;
  expensePaidCents: number;
  prevExpensePaidCents: number | null;
  netResultCents: number;
  prevNetResultCents: number | null;
  appointmentsCount: number;
  prevAppointmentsCount: number | null;
  avgTicketCents: number | null;
  prevAvgTicketCents: number | null;
  salesCount: number;
  prevSalesCount: number | null;
  newCustomersCount: number;
  prevNewCustomersCount: number | null;
  cancellationsCount: number;
  prevCancellationsCount: number | null;
  noShowCount: number;
  prevNoShowCount: number | null;
};

export type ServiceRanking = {
  serviceName: string;
  count: number;
  revenueCents: number;
  percentOfTotal: number;
};

export type AppointmentsReport = {
  total: number;
  completed: number;
  waiting: number;
  cancelled: number;
  noShow: number;
  avgTicketCents: number | null;
  avgDurationMinutes: number | null;
  byDay: Array<{ date: string; label: string; count: number }>;
};

export type CustomerReport = {
  activeCount: number;
  newCount: number;
  recurringCount: number;
  topBySpend: Array<{ id: string; name: string; totalCents: number; count: number }>;
  topByVisits: Array<{ id: string; name: string; count: number }>;
  inactiveCount: number;
  inactiveDays: number;
};

export type RetentionReport = {
  returnRate: number;
  totalWithAppointments: number;
  totalReturning: number;
  explanation: string;
};

export type PetReport = {
  attendedCount: number;
  newCount: number;
  topByVisits: Array<{ id: string; name: string; species: string; count: number }>;
  bySpecies: Array<{ species: string; count: number }>;
  bySize: Array<{ size: string; count: number }>;
};

export type EmployeePerformance = {
  employeeId: string;
  employeeName: string;
  appointmentsCount: number;
  revenueCents: number;
  avgPerDay: number;
  cancellations: number;
};

export type OccupancyReport = {
  overallPercent: number;
  overallServedPercent: number;
  capacityMinutes: number;
  reservedMinutes: number;
  servedMinutes: number;
  noShowMinutes: number;
  cancelledMinutes: number;
  totalSlotsAvailable: number;
  totalSlotsUsed: number;
  reservedAppointmentCount: number;
  servedAppointmentCount: number;
  noShowCount: number;
  cancelledCount: number;
  byWeekday: Array<{
    weekday: number;
    label: string;
    percent: number;
    count: number;
    capacityMinutes: number;
    reservedMinutes: number;
    servedMinutes: number;
  }>;
  byHourBand: Array<{ band: string; count: number }>;
};

export type CancellationReport = {
  total: number;
  noShowTotal: number;
  ratePercent: number;
  byDay: Array<{ date: string; label: string; cancelled: number; noShow: number }>;
  topCustomers: Array<{ id: string; name: string; count: number }>;
};

export const VALID_PDV_SALE_STATUSES = ["completed", "partially_paid"] as const;

export type ValidPdvSaleStatus = (typeof VALID_PDV_SALE_STATUSES)[number];

export type PdvReport = {
  totalSoldCents: number;
  salesCount: number;
  avgTicketCents: number | null;
  grossProfitCents: number;
  topProducts: Array<{
    productId: string;
    name: string;
    unitsSold: number;
    revenueCents: number;
    profitCents: number;
  }>;
};

export type StockMovementUnknown = {
  productId: string;
  productName: string;
  type: string;
  quantity: number;
};

export type StockReconciliationRow = {
  productId: string;
  productName: string;
  opening: number;
  entries: number;
  returns: number;
  adjustmentPositive: number;
  sales: number;
  internalUse: number;
  exits: number;
  losses: number;
  adjustmentNegative: number;
  unknown: number;
  closingFromMovements: number;
  currentStock: number;
  allTimeFromMovements: number;
  divergence: number;
  hasLegacyDivergence: boolean;
};

export type StockLossRow = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  reason: string | null;
  estimatedCostCents: number | null;
};

export type StockExpiringRow = {
  productId: string;
  productName: string;
  batchCode: string;
  expirationDate: string;
  quantity: number;
  unit: string;
  bucket: "expired" | "expires_today" | "expiring_soon";
};

export type StockReport = {
  estimatedValueCents: number;
  lowStockCount: number;
  outOfStockCount: number;
  topExits: Array<{ productId: string; name: string; quantity: number }>;
  topEntries: Array<{ productId: string; name: string; quantity: number }>;
  losses: StockLossRow[];
  expired: StockExpiringRow[];
  expiresToday: StockExpiringRow[];
  expiringSoon: StockExpiringRow[];
  unknownMovements: StockMovementUnknown[];
  reconciliation: StockReconciliationRow[];
  reconciliationDivergenceCount: number;
};

export type PackageInconsistency = {
  kind: "cancelled_paid_legacy" | "unknown";
  packageId: string;
  detail: string;
};

export type PackagesReport = {
  soldCount: number;
  billedCents: number;
  receivedCents: number;
  revenueCents: number;
  pendingCount: number;
  activeCount: number;
  expiredCount: number;
  fullyUsedCount: number;
  cancelledCount: number;
  totalCreditsRemaining: number;
  inconsistencies: PackageInconsistency[];
};

export type WeekdayDistribution = Array<{ weekday: number; label: string; count: number; revenueCents: number }>;

export type HourDistribution = Array<{ band: string; count: number }>;
