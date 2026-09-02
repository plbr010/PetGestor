import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import type { AppointmentStatusFilter } from "@/features/appointments/status";
import type {
  AppointmentCatalogPackageOption,
  AppointmentCustomerPackageOption,
  AppointmentDetail,
  AppointmentListItem,
} from "@/features/appointments/types";
import { isRangeBlockedByTimeBlocks } from "@/features/appointments/waitlist/utils";
import { getTimeBlocksForSlotCheck } from "@/features/appointments/time-blocks/queries";
import { generateTimeSlots, SLOT_INTERVAL_MINUTES } from "@/features/appointments/utils";
import { buildPetPhotoThumbMap, withPetPhotoThumb } from "@/features/pets/enrich-photo-thumbs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addDaysToDateString,
  getWeekdayInTimezone,
  isPastLocalDateTime,
  localDateTimeToUtcIso,
} from "@/lib/timezone";
import { isValidUuid } from "@/lib/security/uuid";
import type { AppointmentStatus, CustomerPackageStatus, PetSize } from "@/types/database.types";

type AppointmentFilters = {
  companyId: string;
  employeeId?: string;
  status?: AppointmentStatusFilter;
};

type AppointmentRow = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: AppointmentStatus;
  service_name_snapshot: string;
  price_cents_snapshot: number;
  duration_minutes_snapshot: number;
  pet_size: PetSize | null;
  notes: string | null;
  recurrence_id: string | null;
  recurrence_index: number | null;
  customer_id: string;
  pet_id: string;
  service_id: string;
  employee_id: string;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  customer_package_id?: string | null;
  pets: { id: string; name: string; photo_thumb_path?: string | null; photo_storage_path?: string | null } | { id: string; name: string; photo_thumb_path?: string | null; photo_storage_path?: string | null }[];
  customers: { id: string; name: string; phone: string } | { id: string; name: string; phone: string }[];
  employees: { id: string; name: string } | { id: string; name: string }[];
};

function unwrapJoin<T>(value: T | T[]): T {
  return Array.isArray(value) ? (value[0] ?? ({} as T)) : value;
}

async function getCustomerPackageName(
  companyId: string,
  customerPackageId: string | null,
): Promise<string | null> {
  if (!customerPackageId || !isValidUuid(customerPackageId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_service_packages")
    .select("package_name_snapshot")
    .eq("company_id", companyId)
    .eq("id", customerPackageId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.package_name_snapshot;
}

function mapAppointmentRow(row: AppointmentRow): AppointmentListItem {
  const pet = unwrapJoin(row.pets);
  const customer = unwrapJoin(row.customers);
  const employee = unwrapJoin(row.employees);

  return {
    id: row.id,
    scheduled_start: row.scheduled_start,
    scheduled_end: row.scheduled_end,
    status: row.status,
    service_name_snapshot: row.service_name_snapshot,
    price_cents_snapshot: row.price_cents_snapshot,
    duration_minutes_snapshot: row.duration_minutes_snapshot,
    pet_size: row.pet_size,
    notes: row.notes,
    recurrence_id: row.recurrence_id ?? null,
    recurrence_index: row.recurrence_index ?? null,
    customer_id: row.customer_id,
    pet_id: row.pet_id,
    service_id: row.service_id,
    employee_id: row.employee_id,
    pet: { id: pet.id, name: pet.name },
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    employee: { id: employee.id, name: employee.name },
    customer_package_id: row.customer_package_id ?? null,
    customer_package_name: null,
  };
}

async function mapAppointmentRows(
  companyId: string,
  rows: AppointmentRow[],
): Promise<AppointmentListItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const thumbMap = await buildPetPhotoThumbMap(
    companyId,
    rows.map((row) => {
      const pet = unwrapJoin(row.pets);
      return {
        id: pet.id,
        photo_thumb_path: pet.photo_thumb_path ?? null,
        photo_storage_path: pet.photo_storage_path ?? null,
      };
    }),
  );

  return rows.map((row) => {
    const item = mapAppointmentRow(row);
    return {
      ...item,
      pet: withPetPhotoThumb(item.pet, thumbMap),
    };
  });
}

function getDayBoundsUtc(date: string, timeZone: string) {
  const start = localDateTimeToUtcIso(date, "00:00", timeZone);
  const end = localDateTimeToUtcIso(addDaysToDateString(date, 1), "00:00", timeZone);
  return { start, end };
}

async function queryAppointmentsInRange(
  companyId: string,
  rangeStart: string,
  rangeEnd: string,
  filters: Omit<AppointmentFilters, "companyId">,
): Promise<AppointmentListItem[]> {
  noStore();

  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from("appointments")
    .select(
      `id, scheduled_start, scheduled_end, status, service_name_snapshot, price_cents_snapshot,
       duration_minutes_snapshot, pet_size, notes, recurrence_id, recurrence_index,
       customer_id, pet_id, service_id, employee_id,
       cancellation_reason, created_at, updated_at,
       pets!inner(id, name, photo_thumb_path, photo_storage_path), customers!inner(id, name, phone), employees!inner(id, name)`,
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("scheduled_start", rangeStart)
    .lt("scheduled_start", rangeEnd)
    .order("scheduled_start", { ascending: true });

  if (filters.employeeId && isValidUuid(filters.employeeId)) {
    builder = builder.eq("employee_id", filters.employeeId);
  }

  if (filters.status && filters.status !== "all") {
    builder = builder.eq("status", filters.status);
  }

  const { data, error } = await builder;

  if (error) {
    console.error("[appointments:query]", error.message);
    return [];
  }

  const rows = (data as AppointmentRow[] | null) ?? [];
  return mapAppointmentRows(companyId, rows);
}

export async function getAppointmentsForDay(
  companyId: string,
  date: string,
  timeZone: string,
  filters: Omit<AppointmentFilters, "companyId"> = {},
): Promise<AppointmentListItem[]> {
  const { start, end } = getDayBoundsUtc(date, timeZone);
  return queryAppointmentsInRange(companyId, start, end, filters);
}

export async function getAppointmentsForWeek(
  companyId: string,
  weekStartDate: string,
  timeZone: string,
  filters: Omit<AppointmentFilters, "companyId"> = {},
): Promise<AppointmentListItem[]> {
  const weekEnd = addDaysToDateString(weekStartDate, 7);
  const { start } = getDayBoundsUtc(weekStartDate, timeZone);
  const { start: end } = getDayBoundsUtc(weekEnd, timeZone);
  return queryAppointmentsInRange(companyId, start, end, filters);
}

export async function getAppointmentById(
  companyId: string,
  appointmentId: string,
): Promise<AppointmentDetail | null> {
  noStore();

  if (!isValidUuid(appointmentId) || !isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `id, scheduled_start, scheduled_end, status, service_name_snapshot, price_cents_snapshot,
       duration_minutes_snapshot, pet_size, notes, recurrence_id, recurrence_index,
       customer_id, pet_id, service_id, employee_id, customer_package_id,
       cancellation_reason, created_at, updated_at,
       pets!inner(id, name, photo_thumb_path, photo_storage_path), customers!inner(id, name, phone), employees!inner(id, name)`,
    )
    .eq("company_id", companyId)
    .eq("id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const mapped = mapAppointmentRow(data as AppointmentRow);
  const petRow = unwrapJoin((data as AppointmentRow).pets);
  const thumbMap = await buildPetPhotoThumbMap(companyId, [
    {
      id: mapped.pet.id,
      photo_thumb_path: petRow.photo_thumb_path ?? null,
      photo_storage_path: petRow.photo_storage_path ?? null,
    },
  ]);
  const row = data as AppointmentRow;

  return {
    ...mapped,
    pet: withPetPhotoThumb(mapped.pet, thumbMap),
    customer_id: row.customer_id,
    pet_id: row.pet_id,
    service_id: row.service_id,
    employee_id: row.employee_id,
    cancellation_reason: row.cancellation_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    customer_package_id: row.customer_package_id ?? null,
    customer_package_name: await getCustomerPackageName(
      companyId,
      row.customer_package_id ?? null,
    ),
  };
}

export async function requireAppointmentById(
  companyId: string,
  appointmentId: string,
): Promise<AppointmentDetail> {
  const appointment = await getAppointmentById(companyId, appointmentId);

  if (!appointment) {
    notFound();
  }

  return appointment;
}

export async function countAppointmentsForDay(
  companyId: string,
  date: string,
  timeZone: string,
  filters: Pick<AppointmentFilters, "employeeId"> = {},
): Promise<number> {
  noStore();
  const { start, end } = getDayBoundsUtc(date, timeZone);
  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from("appointments")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .gte("scheduled_start", start)
    .lt("scheduled_start", end);

  if (filters.employeeId && isValidUuid(filters.employeeId)) {
    builder = builder.eq("employee_id", filters.employeeId);
  }

  const { count, error } = await builder;

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export async function getUpcomingAppointments(
  companyId: string,
  limit = 5,
  filters: Pick<AppointmentFilters, "employeeId"> = {},
): Promise<AppointmentListItem[]> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  let builder = supabase
    .from("appointments")
    .select(
      `id, scheduled_start, scheduled_end, status, service_name_snapshot, price_cents_snapshot,
       duration_minutes_snapshot, pet_size, notes, recurrence_id, recurrence_index,
       customer_id, pet_id, service_id, employee_id,
       cancellation_reason, created_at, updated_at,
       pets!inner(id, name, photo_thumb_path, photo_storage_path), customers!inner(id, name, phone), employees!inner(id, name)`,
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_start", now)
    .order("scheduled_start", { ascending: true })
    .limit(limit);

  if (filters.employeeId && isValidUuid(filters.employeeId)) {
    builder = builder.eq("employee_id", filters.employeeId);
  }

  const { data, error } = await builder;

  if (error) {
    return [];
  }

  return mapAppointmentRows(companyId, (data as AppointmentRow[] | null) ?? []);
}

export async function getAvailableTimeSlots(
  companyId: string,
  employeeId: string,
  serviceId: string,
  date: string,
  timeZone: string,
  durationMinutes: number,
  petSize: PetSize | null,
  excludeAppointmentId?: string,
): Promise<string[]> {
  noStore();

  if (!isValidUuid(employeeId) || !isValidUuid(serviceId)) {
    return [];
  }

  const supabase = await createSupabaseServerClient();

  const weekday = getWeekdayInTimezone(localDateTimeToUtcIso(date, "12:00", timeZone), timeZone);

  const { data: workingHour } = await supabase
    .from("employee_working_hours")
    .select("enabled, start_time, end_time")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .eq("weekday", weekday)
    .maybeSingle();

  if (!workingHour?.enabled || !workingHour.start_time || !workingHour.end_time) {
    return [];
  }

  const { start: dayStart, end: dayEnd } = getDayBoundsUtc(date, timeZone);

  let apptQuery = supabase
    .from("appointments")
    .select("scheduled_start, scheduled_end")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .gte("scheduled_start", dayStart)
    .lt("scheduled_start", dayEnd);

  if (excludeAppointmentId && isValidUuid(excludeAppointmentId)) {
    apptQuery = apptQuery.neq("id", excludeAppointmentId);
  }

  const { data: appointments } = await apptQuery;

  const timeBlocks = await getTimeBlocksForSlotCheck(companyId, employeeId, date, timeZone);

  const slots = generateTimeSlots(
    workingHour.start_time.slice(0, 5),
    workingHour.end_time.slice(0, 5),
    SLOT_INTERVAL_MINUTES,
  );

  const busyRanges =
    appointments?.map((a) => ({
      start: new Date(a.scheduled_start).getTime(),
      end: new Date(a.scheduled_end).getTime(),
    })) ?? [];

  const available: string[] = [];

  for (const slot of slots) {
    if (isPastLocalDateTime(date, slot, timeZone)) {
      continue;
    }

    const slotStart = new Date(localDateTimeToUtcIso(date, slot, timeZone)).getTime();
    const slotEnd = slotStart + durationMinutes * 60_000;
    const workEnd = new Date(
      localDateTimeToUtcIso(date, workingHour.end_time.slice(0, 5), timeZone),
    ).getTime();

    if (slotEnd > workEnd) {
      continue;
    }

    const overlaps = busyRanges.some(
      (range) => slotStart < range.end && slotEnd > range.start,
    );

    const blocked = isRangeBlockedByTimeBlocks(
      slotStart,
      slotEnd,
      timeBlocks,
      employeeId,
    );

    if (!overlaps && !blocked) {
      available.push(slot);
    }
  }

  void petSize;
  void serviceId;

  return available;
}

export async function getAppointmentFormOptions(companyId: string, companyTimezone: string) {
  noStore();

  const supabase = await createSupabaseServerClient();

  const [customersResult, petsResult, servicesResult, linksResult, sizePricesResult, soldPackagesResult, catalogResult] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(500),
      supabase
        .from("pets")
        .select("id, name, customer_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(1000),
      supabase
        .from("services")
        .select("id, name, pricing_mode, price_cents, duration_minutes")
        .eq("company_id", companyId)
        .eq("active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("employee_services")
        .select("employee_id, service_id, employees!inner(id, name, active, can_be_scheduled, deleted_at)")
        .eq("company_id", companyId),
      supabase
        .from("service_size_prices")
        .select("service_id, size, price_cents, duration_minutes")
        .eq("company_id", companyId),
      supabase
        .from("customer_service_packages")
        .select(
          `
          id, customer_id, pet_id, package_name_snapshot, status, starts_at, expires_at,
          customer_service_package_items!customer_service_package_items_package_company_fkey(
            service_id, service_name_snapshot, quantity_total, quantity_used
          )
        `,
        )
        .eq("company_id", companyId)
        .neq("status", "cancelled")
        .order("expires_at", { ascending: true })
        .limit(1000),
      supabase
        .from("service_packages")
        .select(
          `
          id, name,
          service_package_items!service_package_items_package_company_fkey(service_id)
        `,
        )
        .eq("company_id", companyId)
        .eq("active", true)
        .is("deleted_at", null)
        .limit(200),
    ]);

  if (customersResult.error || petsResult.error || servicesResult.error || linksResult.error) {
    throw new Error("Não foi possível carregar opções do formulário.");
  }

  const petsByCustomer: Record<string, { id: string; name: string }[]> = {};

  for (const pet of petsResult.data ?? []) {
    const list = petsByCustomer[pet.customer_id] ?? [];
    list.push({ id: pet.id, name: pet.name });
    petsByCustomer[pet.customer_id] = list;
  }

  const employeesByService: Record<string, { id: string; name: string }[]> = {};

  for (const link of linksResult.data ?? []) {
    const employeeRaw = link.employees as
      | { id: string; name: string; active: boolean; can_be_scheduled: boolean; deleted_at: string | null }
      | { id: string; name: string; active: boolean; can_be_scheduled: boolean; deleted_at: string | null }[];

    const employee = Array.isArray(employeeRaw) ? employeeRaw[0] : employeeRaw;

    if (
      !employee ||
      !employee.active ||
      !employee.can_be_scheduled ||
      employee.deleted_at
    ) {
      continue;
    }

    const list = employeesByService[link.service_id] ?? [];
    if (!list.some((item) => item.id === employee.id)) {
      list.push({ id: employee.id, name: employee.name });
      employeesByService[link.service_id] = list;
    }
  }

  for (const key of Object.keys(employeesByService)) {
    employeesByService[key].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  const sizePricesByService: Record<
    string,
    { size: PetSize; price_cents: number; duration_minutes: number }[]
  > = {};

  for (const row of sizePricesResult.data ?? []) {
    const list = sizePricesByService[row.service_id] ?? [];
    list.push({
      size: row.size,
      price_cents: row.price_cents,
      duration_minutes: row.duration_minutes,
    });
    sizePricesByService[row.service_id] = list;
  }

  const customerPackages: AppointmentCustomerPackageOption[] = [];

  if (!soldPackagesResult.error) {
    for (const row of soldPackagesResult.data ?? []) {
      const items = (
        row.customer_service_package_items as unknown as
          | Array<{
              service_id: string;
              service_name_snapshot: string;
              quantity_total: number;
              quantity_used: number;
            }>
          | null
      )?.map((item) => ({
        serviceId: item.service_id,
        serviceName: item.service_name_snapshot,
        remaining: Math.max(item.quantity_total - item.quantity_used, 0),
      })) ?? [];

      customerPackages.push({
        id: row.id,
        customerId: row.customer_id,
        petId: row.pet_id,
        name: row.package_name_snapshot,
        startsAt: String(row.starts_at).slice(0, 10),
        expiresAt: String(row.expires_at).slice(0, 10),
        status: row.status as CustomerPackageStatus,
        items,
      });
    }
  }

  const catalogPackages: AppointmentCatalogPackageOption[] = [];

  if (!catalogResult.error && !soldPackagesResult.error) {
    for (const row of catalogResult.data ?? []) {
      const items = row.service_package_items as unknown as Array<{ service_id: string }> | null;
      catalogPackages.push({
        id: row.id,
        name: row.name,
        serviceIds: items?.map((item) => item.service_id) ?? [],
      });
    }
  }

  return {
    customers: customersResult.data ?? [],
    petsByCustomer,
    services: servicesResult.data ?? [],
    employeesByService,
    sizePricesByService,
    companyTimezone,
    customerPackages,
    catalogPackages,
  };
}

export async function getSchedulableEmployeesForFilter(companyId: string) {
  noStore();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("employees")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("active", true)
    .eq("can_be_scheduled", true)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    return [];
  }

  return data ?? [];
}
