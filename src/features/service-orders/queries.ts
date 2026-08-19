import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import type { ServiceOrderStatusFilter } from "@/features/service-orders/status";
import type { ServiceOrderDetail, ServiceOrderListItem } from "@/features/service-orders/types";
import { buildPetPhotoThumbMap, withPetPhotoThumb } from "@/features/pets/enrich-photo-thumbs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, localDateTimeToUtcIso } from "@/lib/timezone";
import { isValidUuid } from "@/lib/security/uuid";
import type { AppointmentStatus, ServiceOrderStatus } from "@/types/database.types";

const SERVICE_ORDER_SELECT = `
  id, appointment_id, status, check_in_at, started_at, ready_at, completed_at,
  intake_notes, internal_notes, completion_notes, created_at, updated_at,
  appointments!inner(
    id, scheduled_start, scheduled_end, status,
    service_name_snapshot, price_cents_snapshot, duration_minutes_snapshot,
    pets!inner(id, name, photo_thumb_path),
    customers!inner(id, name, phone),
    employees!inner(id, name)
  )
`;

type ServiceOrderRow = {
  id: string;
  appointment_id: string;
  status: ServiceOrderStatus;
  check_in_at: string;
  started_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  intake_notes: string | null;
  internal_notes: string | null;
  completion_notes: string | null;
  created_at: string;
  updated_at: string;
  appointments: AppointmentJoin | AppointmentJoin[];
};

type AppointmentJoin = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: AppointmentStatus;
  service_name_snapshot: string;
  price_cents_snapshot: number;
  duration_minutes_snapshot: number;
  pets: { id: string; name: string; photo_thumb_path?: string | null } | { id: string; name: string; photo_thumb_path?: string | null }[];
  customers: { id: string; name: string; phone: string } | { id: string; name: string; phone: string }[];
  employees: { id: string; name: string } | { id: string; name: string }[];
};

function unwrapJoin<T>(value: T | T[]): T {
  return Array.isArray(value) ? (value[0] ?? ({} as T)) : value;
}

function mapServiceOrderRow(row: ServiceOrderRow): ServiceOrderListItem {
  const appointmentRaw = unwrapJoin(row.appointments);
  const pet = unwrapJoin(appointmentRaw.pets);
  const customer = unwrapJoin(appointmentRaw.customers);
  const employee = unwrapJoin(appointmentRaw.employees);

  return {
    id: row.id,
    appointment_id: row.appointment_id,
    status: row.status,
    check_in_at: row.check_in_at,
    started_at: row.started_at,
    ready_at: row.ready_at,
    completed_at: row.completed_at,
    intake_notes: row.intake_notes,
    internal_notes: row.internal_notes,
    completion_notes: row.completion_notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    appointment: {
      id: appointmentRaw.id,
      scheduled_start: appointmentRaw.scheduled_start,
      scheduled_end: appointmentRaw.scheduled_end,
      status: appointmentRaw.status,
      service_name_snapshot: appointmentRaw.service_name_snapshot,
      price_cents_snapshot: appointmentRaw.price_cents_snapshot,
      duration_minutes_snapshot: appointmentRaw.duration_minutes_snapshot,
      pet: { id: pet.id, name: pet.name },
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      employee: { id: employee.id, name: employee.name },
    },
  };
}

function getDayBoundsUtc(date: string, timeZone: string) {
  const start = localDateTimeToUtcIso(date, "00:00", timeZone);
  const end = localDateTimeToUtcIso(addDaysToDateString(date, 1), "00:00", timeZone);
  return { start, end };
}

type ServiceOrderQueryFilters = {
  status?: ServiceOrderStatusFilter;
  date?: string;
  timeZone?: string;
  activeOnly?: boolean;
};

async function queryServiceOrders(
  companyId: string,
  filters: ServiceOrderQueryFilters = {},
): Promise<ServiceOrderListItem[]> {
  noStore();

  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from("service_orders")
    .select(SERVICE_ORDER_SELECT)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("check_in_at", { ascending: true });

  if (filters.activeOnly) {
    builder = builder.in("status", ["waiting", "in_progress", "ready"]);
  } else if (filters.status && filters.status !== "all") {
    builder = builder.eq("status", filters.status);
  }

  if (filters.date && filters.timeZone) {
    const { start, end } = getDayBoundsUtc(filters.date, filters.timeZone);
    builder = builder.gte("check_in_at", start).lt("check_in_at", end);
  }

  const { data, error } = await builder;

  if (error) {
    return [];
  }

  const rows = (data as ServiceOrderRow[] | null) ?? [];
  const thumbMap = await buildPetPhotoThumbMap(
    companyId,
    rows.map((row) => {
      const pet = unwrapJoin(unwrapJoin(row.appointments).pets);
      return { id: pet.id, photo_thumb_path: pet.photo_thumb_path ?? null };
    }),
  );

  return rows.map((row) => {
    const item = mapServiceOrderRow(row);
    return {
      ...item,
      appointment: {
        ...item.appointment,
        pet: withPetPhotoThumb(item.appointment.pet, thumbMap),
      },
    };
  });
}

export async function getServiceOrders(
  companyId: string,
  filters: ServiceOrderQueryFilters = {},
): Promise<ServiceOrderListItem[]> {
  return queryServiceOrders(companyId, filters);
}

export async function getActiveServiceOrders(
  companyId: string,
  date?: string,
  timeZone?: string,
): Promise<ServiceOrderListItem[]> {
  return queryServiceOrders(companyId, { activeOnly: true, date, timeZone });
}

export async function getServiceOrdersForToday(
  companyId: string,
  date: string,
  timeZone: string,
  status?: ServiceOrderStatusFilter,
): Promise<ServiceOrderListItem[]> {
  return queryServiceOrders(companyId, { date, timeZone, status });
}

export async function getServiceOrderById(
  companyId: string,
  serviceOrderId: string,
): Promise<ServiceOrderDetail | null> {
  noStore();

  if (!isValidUuid(serviceOrderId) || !isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("service_orders")
    .select(SERVICE_ORDER_SELECT)
    .eq("company_id", companyId)
    .eq("id", serviceOrderId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapServiceOrderRow(data as ServiceOrderRow);
}

export async function requireServiceOrderById(
  companyId: string,
  serviceOrderId: string,
): Promise<ServiceOrderDetail> {
  const order = await getServiceOrderById(companyId, serviceOrderId);

  if (!order) {
    notFound();
  }

  return order;
}

export async function getServiceOrderByAppointmentId(
  companyId: string,
  appointmentId: string,
): Promise<ServiceOrderDetail | null> {
  noStore();

  if (!isValidUuid(appointmentId) || !isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("service_orders")
    .select(SERVICE_ORDER_SELECT)
    .eq("company_id", companyId)
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapServiceOrderRow(data as ServiceOrderRow);
}

export async function countServiceOrdersByStatus(
  companyId: string,
  status: ServiceOrderStatus,
  date?: string,
  timeZone?: string,
): Promise<number> {
  noStore();

  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from("service_orders")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", status)
    .is("deleted_at", null);

  if (date && timeZone) {
    const { start, end } = getDayBoundsUtc(date, timeZone);
    builder = builder.gte("check_in_at", start).lt("check_in_at", end);
  }

  const { count, error } = await builder;

  if (error) {
    return 0;
  }

  return count ?? 0;
}
