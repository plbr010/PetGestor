import { unstable_noStore as noStore } from "next/cache";

import type { WaitlistListItem } from "@/features/appointments/waitlist/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";

function mapWaitlistRow(row: Record<string, unknown>): WaitlistListItem {
  const customer = row.customers as { id: string; name: string };
  const pet = row.pets as { id: string; name: string };
  const service = row.services as { id: string; name: string };
  const employeeRaw = row.employees as { id: string; name: string } | null;

  return {
    id: String(row.id),
    customer_id: String(row.customer_id),
    pet_id: String(row.pet_id),
    service_id: String(row.service_id),
    preferred_employee_id: (row.preferred_employee_id as string | null) ?? null,
    preferred_date: (row.preferred_date as string | null) ?? null,
    preferred_period: (row.preferred_period as WaitlistListItem["preferred_period"]) ?? null,
    preferred_time_start: (row.preferred_time_start as string | null) ?? null,
    preferred_time_end: (row.preferred_time_end as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    status: row.status as WaitlistListItem["status"],
    appointment_id: (row.appointment_id as string | null) ?? null,
    contacted_at: (row.contacted_at as string | null) ?? null,
    created_at: String(row.created_at),
    customer: { id: customer.id, name: customer.name },
    pet: { id: pet.id, name: pet.name },
    service: { id: service.id, name: service.name },
    preferredEmployee: employeeRaw ? { id: employeeRaw.id, name: employeeRaw.name } : null,
  };
}

export async function getActiveWaitlist(
  companyId: string,
): Promise<WaitlistListItem[]> {
  if (!isValidUuid(companyId)) {
    return [];
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("appointment_waitlist")
    .select(
      `
      id, customer_id, pet_id, service_id, preferred_employee_id,
      preferred_date, preferred_period, preferred_time_start, preferred_time_end,
      notes, status, appointment_id, contacted_at, created_at,
      customers!inner(id, name),
      pets!inner(id, name),
      services!inner(id, name),
      employees(id, name)
    `,
    )
    .eq("company_id", companyId)
    .in("status", ["waiting", "contacted"])
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => mapWaitlistRow(row as unknown as Record<string, unknown>));
}

export async function getWaitlistMatchCandidates(companyId: string) {
  if (!isValidUuid(companyId)) {
    return [];
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("appointment_waitlist")
    .select(
      "id, service_id, preferred_employee_id, preferred_date, preferred_period, preferred_time_start, preferred_time_end, status",
    )
    .eq("company_id", companyId)
    .in("status", ["waiting", "contacted"]);

  return data ?? [];
}

export async function getWaitlistEntryById(companyId: string, waitlistId: string) {
  if (!isValidUuid(companyId) || !isValidUuid(waitlistId)) {
    return null;
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("appointment_waitlist")
    .select(
      `
      id, customer_id, pet_id, service_id, preferred_employee_id,
      preferred_date, preferred_period, preferred_time_start, preferred_time_end,
      notes, status, appointment_id, contacted_at, created_at,
      customers!inner(id, name),
      pets!inner(id, name),
      services!inner(id, name),
      employees(id, name)
    `,
    )
    .eq("company_id", companyId)
    .eq("id", waitlistId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return mapWaitlistRow(data as unknown as Record<string, unknown>);
}
