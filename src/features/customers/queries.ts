import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import type { CustomerDetail, CustomerListItem, CustomerOption } from "@/features/customers/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildPaginatedResult,
  DEFAULT_PAGE_SIZE,
  getPaginationRange,
  type PaginatedResult,
  parsePageParam,
  sanitizeSearchTerm,
} from "@/lib/pagination";
import { normalizePhone } from "@/lib/phone";
import { isValidUuid } from "@/lib/security/uuid";

type GetCustomersParams = {
  companyId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  includeArchived?: boolean;
};

function attachPetCounts(
  customers: Omit<CustomerListItem, "petsCount">[],
  petRows: { customer_id: string }[] | null,
): CustomerListItem[] {
  const counts = new Map<string, number>();

  for (const row of petRows ?? []) {
    counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1);
  }

  return customers.map((customer) => ({
    ...customer,
    petsCount: counts.get(customer.id) ?? 0,
  }));
}

export async function getCustomers({
  companyId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  includeArchived = false,
}: GetCustomersParams): Promise<PaginatedResult<CustomerListItem>> {
  noStore();

  const supabase = await createSupabaseServerClient();
  const safePage = parsePageParam(String(page));
  const { from, to } = getPaginationRange(safePage, pageSize);
  const search = sanitizeSearchTerm(query);

  let builder = supabase
    .from("customers")
    .select("id, name, phone, email, created_at", { count: "exact" })
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (!includeArchived) {
    builder = builder.is("deleted_at", null);
  }

  if (search) {
    const phoneDigits = normalizePhone(search);
    const filters = [`name.ilike.%${search}%`, `email.ilike.%${search}%`];

    if (phoneDigits.length >= 3) {
      filters.push(`phone.ilike.%${phoneDigits}%`);
    }

    builder = builder.or(filters.join(","));
  }

  const { data, error, count } = await builder.range(from, to);

  if (error) {
    throw new Error("Não foi possível carregar os tutores.");
  }

  const baseCustomers = data ?? [];
  const customerIds = baseCustomers.map((customer) => customer.id);

  let petRows: { customer_id: string }[] | null = null;

  if (customerIds.length > 0) {
    const petsResult = await supabase
      .from("pets")
      .select("customer_id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("customer_id", customerIds);

    if (petsResult.error) {
      throw new Error("Não foi possível carregar os tutores.");
    }

    petRows = petsResult.data;
  }

  return buildPaginatedResult(
    attachPetCounts(baseCustomers, petRows),
    count ?? 0,
    safePage,
    pageSize,
  );
}

export async function getCustomerById(
  companyId: string,
  customerId: string,
  options?: { includeArchived?: boolean },
): Promise<CustomerDetail | null> {
  noStore();

  if (!isValidUuid(customerId) || !isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", customerId);

  if (!options?.includeArchived) {
    builder = builder.is("deleted_at", null);
  }

  const { data, error } = await builder.maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function requireCustomerById(
  companyId: string,
  customerId: string,
): Promise<CustomerDetail> {
  const customer = await getCustomerById(companyId, customerId);

  if (!customer) {
    notFound();
  }

  return customer;
}

export async function getCustomerOptions(companyId: string): Promise<CustomerOption[]> {
  noStore();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error("Não foi possível carregar os tutores.");
  }

  return data ?? [];
}

export async function countActiveCustomers(companyId: string): Promise<number> {
  noStore();

  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export async function countActivePetsForCustomer(
  companyId: string,
  customerId: string,
): Promise<number> {
  noStore();

  if (!isValidUuid(companyId) || !isValidUuid(customerId)) {
    return 0;
  }

  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("pets")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .is("deleted_at", null);

  if (error) {
    return 0;
  }

  return count ?? 0;
}
