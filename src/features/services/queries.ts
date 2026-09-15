import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import type { ServiceDetail, ServiceListItem, ServiceStatusFilter } from "@/features/services/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildPaginatedResult,
  DEFAULT_PAGE_SIZE,
  getPaginationRange,
  type PaginatedResult,
  parsePageParam,
  resolvePaginatedRange,
  sanitizeSearchTerm,
} from "@/lib/pagination";
import { isValidUuid } from "@/lib/security/uuid";
import type { PetSize } from "@/types/database.types";

type GetServicesParams = {
  companyId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  status?: ServiceStatusFilter;
  includeArchived?: boolean;
};

type SizePriceRow = {
  id: string;
  service_id: string;
  size: PetSize;
  price_cents: number;
  duration_minutes: number;
};

async function loadSizePricesForServices(
  companyId: string,
  serviceIds: string[],
): Promise<Map<string, SizePriceRow[]>> {
  const map = new Map<string, SizePriceRow[]>();

  if (serviceIds.length === 0) {
    return map;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("service_size_prices")
    .select("id, service_id, size, price_cents, duration_minutes")
    .eq("company_id", companyId)
    .in("service_id", serviceIds)
    .order("size", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar os serviços.");
  }

  for (const row of data ?? []) {
    const current = map.get(row.service_id) ?? [];
    current.push(row);
    map.set(row.service_id, current);
  }

  return map;
}

export async function getServices({
  companyId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  status = "all",
  includeArchived = false,
}: GetServicesParams): Promise<PaginatedResult<ServiceListItem>> {
  noStore();

  if (!isValidUuid(companyId)) {
    return buildPaginatedResult([], 0, 1, pageSize);
  }

  const supabase = await createSupabaseServerClient();
  const safePage = parsePageParam(String(page));
  const { from, to } = getPaginationRange(safePage, pageSize);
  const search = sanitizeSearchTerm(query);
  const loadErrorMessage = "Não foi possível carregar os serviços.";

  const applyFilters = <
    T extends {
      is: (column: string, value: null) => T;
      eq: (column: string, value: boolean) => T;
      or: (filters: string) => T;
    },
  >(
    builder: T,
  ): T => {
    let next = builder;
    if (!includeArchived) {
      next = next.is("deleted_at", null);
    }
    if (status === "active") {
      next = next.eq("active", true);
    } else if (status === "inactive") {
      next = next.eq("active", false);
    }
    if (search) {
      next = next.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }
    return next;
  };

  const result = await resolvePaginatedRange<Omit<ServiceListItem, "sizePrices">>({
    page: safePage,
    pageSize,
    loadErrorMessage,
    fetchPage: async () => {
      const { data, error, count } = await applyFilters(
        supabase
          .from("services")
          .select(
            "id, name, description, pricing_mode, price_cents, duration_minutes, active, created_at",
            { count: "exact" },
          )
          .eq("company_id", companyId)
          .order("name", { ascending: true }),
      ).range(from, to);
      return { data, count, error };
    },
    fetchCount: async () => {
      const { count, error } = await applyFilters(
        supabase
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
      );
      return { count, error };
    },
  });

  const bySizeIds = result.data
    .filter((service) => service.pricing_mode === "by_size")
    .map((service) => service.id);
  const sizePricesMap = await loadSizePricesForServices(companyId, bySizeIds);

  return {
    ...result,
    data: result.data.map((service) => ({
      ...service,
      sizePrices: sizePricesMap.get(service.id),
    })),
  };
}

export async function getServiceById(
  companyId: string,
  serviceId: string,
  options?: { includeArchived?: boolean },
): Promise<ServiceDetail | null> {
  noStore();

  if (!isValidUuid(serviceId) || !isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from("services")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", serviceId);

  if (!options?.includeArchived) {
    builder = builder.is("deleted_at", null);
  }

  const { data, error } = await builder.maybeSingle();

  if (error || !data) {
    return null;
  }

  const { data: sizePrices, error: sizeError } = await supabase
    .from("service_size_prices")
    .select("id, size, price_cents, duration_minutes")
    .eq("company_id", companyId)
    .eq("service_id", serviceId)
    .order("size", { ascending: true });

  if (sizeError) {
    return null;
  }

  return {
    ...data,
    sizePrices: sizePrices ?? [],
  };
}

export async function requireServiceById(
  companyId: string,
  serviceId: string,
): Promise<ServiceDetail> {
  const service = await getServiceById(companyId, serviceId);

  if (!service) {
    notFound();
  }

  return service;
}

export async function getActiveServices(companyId: string): Promise<ServiceListItem[]> {
  const result = await getServices({
    companyId,
    page: 1,
    pageSize: 200,
    status: "active",
  });

  return result.data;
}

export async function countActiveServices(companyId: string): Promise<number> {
  noStore();

  if (!isValidUuid(companyId)) {
    return 0;
  }

  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("services")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("active", true)
    .is("deleted_at", null);

  if (error) {
    return 0;
  }

  return count ?? 0;
}
