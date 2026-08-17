import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import type {
  AppointmentHistoryRow,
  PetHistoryEvent,
  PetHistoryFilter,
  PetHistorySummary,
} from "@/features/pets/history/types";

const SERVICE_STATUS_LABELS: Record<string, string> = {
  waiting: "Aguardando",
  in_progress: "Em andamento",
  ready: "Pronto",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

function includesFilter(tags: PetHistoryFilter[], filter: PetHistoryFilter): boolean {
  return filter === "all" || tags.includes(filter);
}

export function filterPetHistoryEvents(
  events: PetHistoryEvent[],
  filter: PetHistoryFilter,
): PetHistoryEvent[] {
  if (filter === "all") {
    return events;
  }

  return events.filter((event) => includesFilter(event.filterTags, filter));
}

export function buildEventsFromAppointment(row: AppointmentHistoryRow): PetHistoryEvent[] {
  const events: PetHistoryEvent[] = [];

  events.push({
    id: `${row.id}:created`,
    occurredAt: row.created_at,
    category: "appointment",
    filterTags: ["all", "appointments"],
    title: "Agendamento criado",
    description: row.service_name_snapshot,
    serviceName: row.service_name_snapshot,
    employeeName: row.employee_name,
    priceCents: row.price_cents_snapshot,
    statusLabel: APPOINTMENT_STATUS_LABELS[row.status] ?? row.status,
    notes: row.notes,
    appointmentId: row.id,
    href: `/dashboard/agenda/${row.id}`,
  });

  if (row.status === "cancelled") {
    events.push({
      id: `${row.id}:cancelled`,
      occurredAt: row.scheduled_start,
      category: "cancellation",
      filterTags: ["all", "cancellations", "appointments"],
      title: "Agendamento cancelado",
      description: row.cancellation_reason ?? row.service_name_snapshot,
      serviceName: row.service_name_snapshot,
      employeeName: row.employee_name,
      statusLabel: "Cancelado",
      notes: row.cancellation_reason,
      appointmentId: row.id,
      href: `/dashboard/agenda/${row.id}`,
    });
  }

  if (row.status === "no_show") {
    events.push({
      id: `${row.id}:no_show`,
      occurredAt: row.scheduled_start,
      category: "cancellation",
      filterTags: ["all", "cancellations", "appointments"],
      title: "Não compareceu",
      description: row.service_name_snapshot,
      serviceName: row.service_name_snapshot,
      employeeName: row.employee_name,
      statusLabel: "Falta",
      appointmentId: row.id,
      href: `/dashboard/agenda/${row.id}`,
    });
  }

  const order = row.service_order;

  if (order) {
    events.push({
      id: `${row.id}:check_in`,
      occurredAt: order.check_in_at,
      category: "service",
      filterTags: ["all", "services", "appointments"],
      title: "Check-in realizado",
      description: row.service_name_snapshot,
      serviceName: row.service_name_snapshot,
      employeeName: row.employee_name,
      statusLabel: SERVICE_STATUS_LABELS[order.status] ?? order.status,
      notes: order.intake_notes,
      appointmentId: row.id,
      serviceOrderId: order.id,
      href: `/dashboard/atendimentos/${order.id}`,
    });

    if (order.started_at) {
      events.push({
        id: `${row.id}:started`,
        occurredAt: order.started_at,
        category: "service",
        filterTags: ["all", "services"],
        title: "Atendimento iniciado",
        serviceName: row.service_name_snapshot,
        employeeName: row.employee_name,
        serviceOrderId: order.id,
        href: `/dashboard/atendimentos/${order.id}`,
      });
    }

    if (order.ready_at) {
      events.push({
        id: `${row.id}:ready`,
        occurredAt: order.ready_at,
        category: "service",
        filterTags: ["all", "services"],
        title: "Pet marcado como pronto",
        serviceName: row.service_name_snapshot,
        employeeName: row.employee_name,
        serviceOrderId: order.id,
        href: `/dashboard/atendimentos/${order.id}`,
      });
    }

    if (order.completed_at) {
      events.push({
        id: `${row.id}:completed`,
        occurredAt: order.completed_at,
        category: "service",
        filterTags: ["all", "services"],
        title: "Atendimento concluído",
        description: row.service_name_snapshot,
        serviceName: row.service_name_snapshot,
        employeeName: row.employee_name,
        priceCents: row.price_cents_snapshot,
        statusLabel: "Concluído",
        notes: order.completion_notes ?? order.internal_notes,
        serviceOrderId: order.id,
        href: `/dashboard/atendimentos/${order.id}`,
      });
    }
  }

  if (row.package_usage && row.package_usage.status === "consumed") {
    events.push({
      id: `${row.id}:package`,
      occurredAt: row.package_usage.used_at,
      category: "package",
      filterTags: ["all", "financial", "services"],
      title: "Saldo de pacote utilizado",
      description: row.package_usage.package_name,
      serviceName: row.service_name_snapshot,
      packageName: row.package_usage.package_name,
      priceCents: 0,
      serviceOrderId: order?.id,
      href: order ? `/dashboard/atendimentos/${order.id}` : `/dashboard/agenda/${row.id}`,
    });
  }

  const financial = row.financial_entry;

  if (financial && financial.amount_cents > 0) {
    events.push({
      id: `${row.id}:financial`,
      occurredAt: financial.paid_at ?? order?.ready_at ?? row.scheduled_start,
      category: "financial",
      filterTags: ["all", "financial"],
      title:
        financial.status === "paid"
          ? "Pagamento registrado"
          : "Receita pendente gerada",
      description: row.service_name_snapshot,
      serviceName: row.service_name_snapshot,
      priceCents: financial.amount_cents,
      paymentMethod:
        financial.payment_method != null
          ? PAYMENT_METHOD_LABELS[
              financial.payment_method as keyof typeof PAYMENT_METHOD_LABELS
            ] ?? financial.payment_method
          : null,
      paymentStatus: financial.status,
      serviceOrderId: order?.id,
      href: `/dashboard/financeiro/${financial.id}`,
    });
  }

  return events;
}

export function buildPetHistoryEvents(rows: AppointmentHistoryRow[]): PetHistoryEvent[] {
  const events = rows.flatMap(buildEventsFromAppointment);

  return events.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

export function computeTopService(
  rows: Array<{ service_name_snapshot: string; status: string }>,
): { name: string | null; count: number } {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.status !== "completed" && row.status !== "in_progress") {
      continue;
    }

    counts.set(row.service_name_snapshot, (counts.get(row.service_name_snapshot) ?? 0) + 1);
  }

  let topName: string | null = null;
  let topCount = 0;

  for (const [name, count] of counts.entries()) {
    if (count > topCount) {
      topName = name;
      topCount = count;
    }
  }

  return { name: topName, count: topCount };
}

export function buildPetHistorySummary(input: {
  appointments: Array<{
    scheduled_start: string;
    status: string;
    service_name_snapshot: string;
  }>;
  completedServiceCount: number;
  totalSpentCents: number;
  nowIso?: string;
}): PetHistorySummary {
  const nowMs = new Date(input.nowIso ?? new Date().toISOString()).getTime();

  const completed = input.appointments
    .filter((row) => row.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime(),
    );

  const upcoming = input.appointments
    .filter(
      (row) =>
        (row.status === "scheduled" || row.status === "confirmed") &&
        new Date(row.scheduled_start).getTime() >= nowMs,
    )
    .sort(
      (a, b) =>
        new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
    );

  const topService = computeTopService(input.appointments);

  return {
    lastServiceAt: completed[0]?.scheduled_start ?? null,
    lastServiceName: completed[0]?.service_name_snapshot ?? null,
    nextAppointmentAt: upcoming[0]?.scheduled_start ?? null,
    nextAppointmentServiceName: upcoming[0]?.service_name_snapshot ?? null,
    totalAppointments: input.appointments.length,
    totalCompletedServices: input.completedServiceCount,
    totalSpentCents: input.totalSpentCents,
    topServiceName: topService.name,
    topServiceCount: topService.count,
  };
}
