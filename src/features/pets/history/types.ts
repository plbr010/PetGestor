export const PET_HISTORY_FILTERS = [
  "all",
  "appointments",
  "services",
  "financial",
  "cancellations",
] as const;

export type PetHistoryFilter = (typeof PET_HISTORY_FILTERS)[number];

export type PetHistoryEventCategory =
  | "appointment"
  | "service"
  | "financial"
  | "cancellation"
  | "package";

export type PetHistoryEvent = {
  id: string;
  occurredAt: string;
  category: PetHistoryEventCategory;
  filterTags: PetHistoryFilter[];
  title: string;
  description?: string;
  serviceName?: string;
  employeeName?: string;
  priceCents?: number | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  statusLabel?: string;
  notes?: string | null;
  packageName?: string | null;
  appointmentId?: string;
  serviceOrderId?: string;
  href?: string;
};

export type PetHistorySummary = {
  lastServiceAt: string | null;
  lastServiceName: string | null;
  nextAppointmentAt: string | null;
  nextAppointmentServiceName: string | null;
  totalAppointments: number;
  totalCompletedServices: number;
  totalSpentCents: number;
  topServiceName: string | null;
  topServiceCount: number;
};

export type PetImportantInfo = {
  allergies: string | null;
  importantNotes: string | null;
  notes: string | null;
};

export const PET_HISTORY_PAGE_SIZE = 10;

export function parsePetHistoryFilter(value: string | undefined): PetHistoryFilter {
  if (value && PET_HISTORY_FILTERS.includes(value as PetHistoryFilter)) {
    return value as PetHistoryFilter;
  }

  return "all";
}

export type AppointmentHistoryRow = {
  id: string;
  created_at: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  service_name_snapshot: string;
  price_cents_snapshot: number;
  notes: string | null;
  cancellation_reason: string | null;
  employee_name: string;
  service_order: {
    id: string;
    status: string;
    check_in_at: string;
    started_at: string | null;
    ready_at: string | null;
    completed_at: string | null;
    intake_notes: string | null;
    internal_notes: string | null;
    completion_notes: string | null;
  } | null;
  financial_entry: {
    id: string;
    status: string;
    amount_cents: number;
    payment_method: string | null;
    paid_at: string | null;
  } | null;
  package_usage: {
    id: string;
    package_name: string;
    used_at: string;
    status: string;
  } | null;
};

export type PetHistoryPage = {
  events: PetHistoryEvent[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalAppointments: number;
};
