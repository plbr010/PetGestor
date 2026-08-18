import { unstable_noStore as noStore } from "next/cache";

import {
  buildPetHistoryEvents,
  buildPetHistorySummary,
} from "@/features/pets/history/build-history";
import { getServiceOrderAttachmentCounts } from "@/features/attachments/queries";
import type {
  AppointmentHistoryRow,
  PetHistoryPage,
  PetHistorySummary,
} from "@/features/pets/history/types";
import { PET_HISTORY_PAGE_SIZE } from "@/features/pets/history/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapAppointmentRow(row: Record<string, unknown>): AppointmentHistoryRow {
  const employee = unwrapJoin(row.employees as { name: string } | { name: string }[]);
  const serviceOrderRaw = unwrapJoin(
    row.service_orders as Record<string, unknown> | Record<string, unknown>[] | null,
  );
  const financialRaw = serviceOrderRaw
    ? unwrapJoin(
        serviceOrderRaw.financial_entries as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null,
      )
    : null;
  const usageRaw = serviceOrderRaw
    ? unwrapJoin(
        serviceOrderRaw.customer_service_package_usages as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null,
      )
    : null;
  const packageRow = usageRaw
    ? unwrapJoin(
        usageRaw.customer_service_packages as
          | { package_name_snapshot: string }
          | { package_name_snapshot: string }[]
          | null,
      )
    : null;

  return {
    id: String(row.id),
    created_at: String(row.created_at),
    scheduled_start: String(row.scheduled_start),
    scheduled_end: String(row.scheduled_end),
    status: String(row.status),
    service_name_snapshot: String(row.service_name_snapshot),
    price_cents_snapshot: Number(row.price_cents_snapshot),
    notes: (row.notes as string | null) ?? null,
    cancellation_reason: (row.cancellation_reason as string | null) ?? null,
    employee_name: employee?.name ?? "—",
    service_order: serviceOrderRaw
      ? {
          id: String(serviceOrderRaw.id),
          status: String(serviceOrderRaw.status),
          check_in_at: String(serviceOrderRaw.check_in_at),
          started_at: (serviceOrderRaw.started_at as string | null) ?? null,
          ready_at: (serviceOrderRaw.ready_at as string | null) ?? null,
          completed_at: (serviceOrderRaw.completed_at as string | null) ?? null,
          intake_notes: (serviceOrderRaw.intake_notes as string | null) ?? null,
          internal_notes: (serviceOrderRaw.internal_notes as string | null) ?? null,
          completion_notes: (serviceOrderRaw.completion_notes as string | null) ?? null,
        }
      : null,
    financial_entry: financialRaw
      ? {
          id: String(financialRaw.id),
          status: String(financialRaw.status),
          amount_cents: Number(financialRaw.amount_cents),
          payment_method: (financialRaw.payment_method as string | null) ?? null,
          paid_at: (financialRaw.paid_at as string | null) ?? null,
        }
      : null,
    package_usage: usageRaw
      ? {
          id: String(usageRaw.id),
          package_name: packageRow?.package_name_snapshot ?? "Pacote",
          used_at: String(usageRaw.used_at),
          status: String(usageRaw.status),
        }
      : null,
  };
}

export async function getPetHistoryPage(
  companyId: string,
  petId: string,
  throughPage = 1,
  pageSize = PET_HISTORY_PAGE_SIZE,
): Promise<PetHistoryPage> {
  if (!isValidUuid(companyId) || !isValidUuid(petId)) {
    return { events: [], page: throughPage, pageSize, hasMore: false, totalAppointments: 0 };
  }

  noStore();
  const supabase = await createSupabaseServerClient();
  const safeThroughPage = Math.max(1, throughPage);
  const limit = safeThroughPage * pageSize;
  const from = 0;
  const to = limit - 1;

  const { data, error, count } = await supabase
    .from("appointments")
    .select(
      `
      id, created_at, scheduled_start, scheduled_end, status,
      service_name_snapshot, price_cents_snapshot, notes, cancellation_reason,
      employees!appointments_employee_company_fkey(name),
      service_orders(
        id, status, check_in_at, started_at, ready_at, completed_at,
        intake_notes, internal_notes, completion_notes,
        financial_entries!financial_entries_service_order_company_fkey(
          id, status, amount_cents, payment_method, paid_at
        ),
        customer_service_package_usages(
          id, used_at, status,
          customer_service_packages(package_name_snapshot)
        )
      )
    `,
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("pet_id", petId)
    .is("deleted_at", null)
    .order("scheduled_start", { ascending: false })
    .range(from, to);

  if (error || !data) {
    return {
      events: [],
      page: safeThroughPage,
      pageSize,
      hasMore: false,
      totalAppointments: 0,
    };
  }

  const rows = data.map((row) => mapAppointmentRow(row as unknown as Record<string, unknown>));
  const serviceOrderIds = rows
    .map((row) => row.service_order?.id)
    .filter((id): id is string => Boolean(id));
  const attachmentCounts = await getServiceOrderAttachmentCounts(companyId, serviceOrderIds);
  const events = buildPetHistoryEvents(rows).map((event) => {
    if (!event.serviceOrderId) {
      return event;
    }

    const attachmentCount = attachmentCounts.get(event.serviceOrderId) ?? 0;
    return attachmentCount > 0 ? { ...event, attachmentCount } : event;
  });
  const totalAppointments = count ?? 0;

  return {
    events,
    page: safeThroughPage,
    pageSize,
    hasMore: limit < totalAppointments,
    totalAppointments,
  };
}

async function collectServiceOrderIds(companyId: string, petId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("appointments")
    .select("service_orders(id)")
    .eq("company_id", companyId)
    .eq("pet_id", petId)
    .is("deleted_at", null);

  if (!data) {
    return [];
  }

  const ids: string[] = [];

  for (const row of data) {
    const order = unwrapJoin(
      row.service_orders as { id: string } | { id: string }[] | null,
    );

    if (order?.id) {
      ids.push(order.id);
    }
  }

  return ids;
}

export async function getPetHistorySummary(
  companyId: string,
  petId: string,
): Promise<PetHistorySummary> {
  if (!isValidUuid(companyId) || !isValidUuid(petId)) {
    return {
      lastServiceAt: null,
      lastServiceName: null,
      nextAppointmentAt: null,
      nextAppointmentServiceName: null,
      totalAppointments: 0,
      totalCompletedServices: 0,
      totalSpentCents: 0,
      topServiceName: null,
      topServiceCount: 0,
    };
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const [appointmentsResult, completedCountResult, packageSalesResult, orderIds] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("scheduled_start, status, service_name_snapshot")
        .eq("company_id", companyId)
        .eq("pet_id", petId)
        .is("deleted_at", null),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("pet_id", petId)
        .eq("status", "completed")
        .is("deleted_at", null),
      supabase
        .from("customer_service_packages")
        .select("financial_entry_id")
        .eq("company_id", companyId)
        .eq("pet_id", petId)
        .neq("status", "cancelled"),
      collectServiceOrderIds(companyId, petId),
    ]);

  const appointments = appointmentsResult.data ?? [];

  let serviceSpentCents = 0;

  if (orderIds.length > 0) {
    const { data: financialRows } = await supabase
      .from("financial_entries")
      .select("amount_cents")
      .eq("company_id", companyId)
      .eq("source_type", "service_order")
      .in("service_order_id", orderIds)
      .eq("status", "paid")
      .is("deleted_at", null);

    serviceSpentCents =
      financialRows?.reduce((sum, row) => sum + (row.amount_cents ?? 0), 0) ?? 0;
  }

  let packageSpentCents = 0;
  const packageFinancialIds =
    packageSalesResult.data
      ?.map((row) => row.financial_entry_id)
      .filter((id): id is string => Boolean(id)) ?? [];

  if (packageFinancialIds.length > 0) {
    const { data: packageFinancialRows } = await supabase
      .from("financial_entries")
      .select("amount_cents")
      .eq("company_id", companyId)
      .in("id", packageFinancialIds)
      .eq("status", "paid")
      .is("deleted_at", null);

    packageSpentCents =
      packageFinancialRows?.reduce((sum, row) => sum + (row.amount_cents ?? 0), 0) ?? 0;
  }

  return buildPetHistorySummary({
    appointments,
    completedServiceCount: completedCountResult.count ?? 0,
    totalSpentCents: serviceSpentCents + packageSpentCents,
  });
}
