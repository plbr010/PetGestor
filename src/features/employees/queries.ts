import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import type {
  EmployeeDetail,
  EmployeeListItem,
  EmployeeSchedulableFilter,
  EmployeeServiceLink,
  EmployeeStatusFilter,
  EmployeeWorkingHourRow,
} from "@/features/employees/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildPaginatedResult,
  DEFAULT_PAGE_SIZE,
  getPaginationRange,
  type PaginatedResult,
  parsePageParam,
  sanitizeSearchTerm,
} from "@/lib/pagination";
import { isValidUuid } from "@/lib/security/uuid";

type GetEmployeesParams = {
  companyId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  status?: EmployeeStatusFilter;
  schedulable?: EmployeeSchedulableFilter;
  includeArchived?: boolean;
};

async function loadServicesForEmployees(
  companyId: string,
  employeeIds: string[],
): Promise<Map<string, EmployeeServiceLink[]>> {
  const map = new Map<string, EmployeeServiceLink[]>();

  if (employeeIds.length === 0) {
    return map;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("employee_services")
    .select("employee_id, service_id, services!inner(name)")
    .eq("company_id", companyId)
    .in("employee_id", employeeIds);

  if (error) {
    throw new Error("Não foi possível carregar os funcionários.");
  }

  for (const row of data ?? []) {
    const serviceName = (row.services as { name: string }).name;
    const current = map.get(row.employee_id) ?? [];
    current.push({ serviceId: row.service_id, serviceName });
    map.set(row.employee_id, current);
  }

  for (const links of map.values()) {
    links.sort((a, b) => a.serviceName.localeCompare(b.serviceName, "pt-BR"));
  }

  return map;
}

function attachServices(
  employees: Omit<EmployeeListItem, "services">[],
  servicesMap: Map<string, EmployeeServiceLink[]>,
): EmployeeListItem[] {
  return employees.map((employee) => ({
    ...employee,
    services: servicesMap.get(employee.id) ?? [],
  }));
}

export async function getEmployees({
  companyId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  status = "all",
  schedulable = "all",
  includeArchived = false,
}: GetEmployeesParams): Promise<PaginatedResult<EmployeeListItem>> {
  noStore();

  if (!isValidUuid(companyId)) {
    return buildPaginatedResult([], 0, 1, pageSize);
  }

  const supabase = await createSupabaseServerClient();
  const safePage = parsePageParam(String(page));
  const { from, to } = getPaginationRange(safePage, pageSize);
  const search = sanitizeSearchTerm(query);

  let builder = supabase
    .from("employees")
    .select(
      "id, name, phone, email, job_title, active, can_be_scheduled, created_at",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (!includeArchived) {
    builder = builder.is("deleted_at", null);
  }

  if (status === "active") {
    builder = builder.eq("active", true);
  } else if (status === "inactive") {
    builder = builder.eq("active", false);
  }

  if (schedulable === "yes") {
    builder = builder.eq("can_be_scheduled", true);
  } else if (schedulable === "no") {
    builder = builder.eq("can_be_scheduled", false);
  }

  if (search) {
    builder = builder.or(
      `name.ilike.%${search}%,job_title.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await builder.range(from, to);

  if (error) {
    throw new Error("Não foi possível carregar os funcionários.");
  }

  const baseEmployees = data ?? [];
  const employeeIds = baseEmployees.map((employee) => employee.id);
  const servicesMap = await loadServicesForEmployees(companyId, employeeIds);

  return buildPaginatedResult(
    attachServices(baseEmployees, servicesMap),
    count ?? 0,
    safePage,
    pageSize,
  );
}

export async function getEmployeeById(
  companyId: string,
  employeeId: string,
  options?: { includeArchived?: boolean },
): Promise<EmployeeDetail | null> {
  noStore();

  if (!isValidUuid(employeeId) || !isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from("employees")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", employeeId);

  if (!options?.includeArchived) {
    builder = builder.is("deleted_at", null);
  }

  const { data, error } = await builder.maybeSingle();

  if (error || !data) {
    return null;
  }

  const [servicesResult, hoursResult] = await Promise.all([
    supabase
      .from("employee_services")
      .select("service_id, services!inner(name)")
      .eq("company_id", companyId)
      .eq("employee_id", employeeId),
    supabase
      .from("employee_working_hours")
      .select("id, weekday, enabled, start_time, end_time")
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .order("weekday", { ascending: true }),
  ]);

  if (servicesResult.error || hoursResult.error) {
    return null;
  }

  const services: EmployeeServiceLink[] =
    servicesResult.data?.map((row) => ({
      serviceId: row.service_id,
      serviceName: (row.services as { name: string }).name,
    })) ?? [];

  services.sort((a, b) => a.serviceName.localeCompare(b.serviceName, "pt-BR"));

  const workingHours: EmployeeWorkingHourRow[] = hoursResult.data ?? [];

  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    job_title: data.job_title,
    notes: data.notes,
    active: data.active,
    can_be_scheduled: data.can_be_scheduled,
    created_at: data.created_at,
    updated_at: data.updated_at,
    deleted_at: data.deleted_at,
    services,
    workingHours,
  };
}

export async function requireEmployeeById(
  companyId: string,
  employeeId: string,
): Promise<EmployeeDetail> {
  const employee = await getEmployeeById(companyId, employeeId);

  if (!employee) {
    notFound();
  }

  return employee;
}

export async function getSchedulableEmployees(companyId: string): Promise<EmployeeListItem[]> {
  const result = await getEmployees({
    companyId,
    page: 1,
    pageSize: 200,
    status: "active",
    schedulable: "yes",
  });

  return result.data;
}

export async function getEmployeeServices(
  companyId: string,
  employeeId: string,
): Promise<EmployeeServiceLink[]> {
  const employee = await getEmployeeById(companyId, employeeId);
  return employee?.services ?? [];
}

export async function getEmployeeWorkingHours(
  companyId: string,
  employeeId: string,
): Promise<EmployeeWorkingHourRow[]> {
  const employee = await getEmployeeById(companyId, employeeId);
  return employee?.workingHours ?? [];
}

export async function countActiveEmployees(companyId: string): Promise<number> {
  noStore();

  if (!isValidUuid(companyId)) {
    return 0;
  }

  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("active", true)
    .is("deleted_at", null);

  if (error) {
    return 0;
  }

  return count ?? 0;
}
