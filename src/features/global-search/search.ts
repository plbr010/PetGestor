import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bestRank,
  escapeIlike,
  foldSearchText,
  prepareSearchQuery,
  rankMatch,
} from "@/features/global-search/normalize";
import {
  GLOBAL_SEARCH_FETCH_PER_GROUP,
  GLOBAL_SEARCH_GROUP_LABELS,
  GLOBAL_SEARCH_LIMIT_PER_GROUP,
  GLOBAL_SEARCH_MIN_CHARS,
  type GlobalSearchGroup,
  type GlobalSearchGroupId,
  type GlobalSearchItem,
  type GlobalSearchResult,
} from "@/features/global-search/types";
import type { MembershipAccess } from "@/lib/auth/permissions";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateTimeDisplay } from "@/lib/pet-display";
import type { Database } from "@/types/database.types";

type DbClient = SupabaseClient<Database>;

const GROUP_PERMISSION: Record<GlobalSearchGroupId, Permission> = {
  customers: "customers.view",
  pets: "pets.view",
  appointments: "appointments.view",
  service_orders: "service_orders.view",
  employees: "employees.view",
  services: "services.view",
  products: "inventory.view",
  sales: "pos.use",
  packages: "services.view",
};

const GROUP_HREF_ALL: Record<GlobalSearchGroupId, string | null> = {
  customers: "/dashboard/tutores",
  pets: "/dashboard/pets",
  appointments: "/dashboard/agenda",
  service_orders: "/dashboard/atendimentos",
  employees: "/dashboard/funcionarios",
  services: "/dashboard/servicos",
  products: "/dashboard/estoque",
  sales: "/dashboard/pdv/vendas",
  packages: "/dashboard/servicos/pacotes",
};

const SERVICE_ORDER_STATUS_LABEL: Record<string, string> = {
  waiting: "Aguardando",
  in_progress: "Em andamento",
  ready: "Pronto",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function finalizeGroup(
  id: GlobalSearchGroupId,
  items: GlobalSearchItem[],
): GlobalSearchGroup {
  const sorted = [...items].sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, "pt-BR"));
  const hasMore = sorted.length > GLOBAL_SEARCH_LIMIT_PER_GROUP;
  return {
    id,
    label: GLOBAL_SEARCH_GROUP_LABELS[id],
    hrefAll: GROUP_HREF_ALL[id],
    hasMore,
    items: sorted.slice(0, GLOBAL_SEARCH_LIMIT_PER_GROUP),
  };
}

async function searchCustomers(
  supabase: DbClient,
  companyId: string,
  term: string,
  folded: string,
  phoneDigits: string,
): Promise<GlobalSearchItem[]> {
  const safe = escapeIlike(term);
  const filters = [`name.ilike.%${safe}%`, `email.ilike.%${safe}%`];
  if (phoneDigits.length >= 3) {
    filters.push(`phone.ilike.%${phoneDigits}%`);
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .or(filters.join(","))
    .order("name", { ascending: true })
    .limit(GLOBAL_SEARCH_FETCH_PER_GROUP);

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
      const phoneHit =
        phoneDigits.length >= 3 && Boolean(row.phone?.includes(phoneDigits));
      const rank = Math.min(
        bestRank([row.name, row.email], folded),
        phoneHit ? 0 : 3,
      );
      const subtitleParts = [
        row.phone ? formatPhoneDisplay(row.phone) : null,
        row.email,
      ].filter(Boolean);

      return {
        id: row.id,
        title: row.name,
        subtitle: subtitleParts.join(" · ") || null,
        href: `/dashboard/tutores/${row.id}`,
        rank,
      };
    });
}

async function searchPets(
  supabase: DbClient,
  companyId: string,
  term: string,
  folded: string,
): Promise<GlobalSearchItem[]> {
  const safe = escapeIlike(term);
  const { data, error } = await supabase
    .from("pets")
    .select("id, name, breed, customers!inner(name)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .or(`name.ilike.%${safe}%,breed.ilike.%${safe}%,customers.name.ilike.%${safe}%`)
    .order("name", { ascending: true })
    .limit(GLOBAL_SEARCH_FETCH_PER_GROUP);

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const customer = unwrapJoin(row.customers as { name: string } | { name: string }[] | null);
    const tutor = customer?.name ?? null;
    return {
      id: row.id,
      title: row.name,
      subtitle: [tutor ? `Tutor: ${tutor}` : null, row.breed].filter(Boolean).join(" · ") || null,
      href: `/dashboard/pets/${row.id}`,
      rank: bestRank([row.name, row.breed, tutor], folded),
    };
  });
}

async function searchAppointments(
  supabase: DbClient,
  companyId: string,
  term: string,
  folded: string,
): Promise<GlobalSearchItem[]> {
  const safe = escapeIlike(term);
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_start, service_name_snapshot, pets!inner(name), customers!inner(name), employees!inner(name)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .or(
      [
        `service_name_snapshot.ilike.%${safe}%`,
        `pets.name.ilike.%${safe}%`,
        `customers.name.ilike.%${safe}%`,
        `employees.name.ilike.%${safe}%`,
      ].join(","),
    )
    .order("scheduled_start", { ascending: false })
    .limit(GLOBAL_SEARCH_FETCH_PER_GROUP);

  if (error || !data) {
    const fallback = await supabase
      .from("appointments")
      .select(
        "id, scheduled_start, service_name_snapshot, pets!inner(name), customers!inner(name), employees!inner(name)",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .ilike("service_name_snapshot", `%${safe}%`)
      .order("scheduled_start", { ascending: false })
      .limit(GLOBAL_SEARCH_FETCH_PER_GROUP);

    if (fallback.error || !fallback.data) {
      return [];
    }

    return fallback.data.map((row) => mapAppointmentItem(row, folded));
  }

  return data.map((row) => mapAppointmentItem(row, folded));
}

function mapAppointmentItem(
  row: {
    id: string;
    scheduled_start: string;
    service_name_snapshot: string;
    pets: { name: string } | { name: string }[] | null;
    customers: { name: string } | { name: string }[] | null;
    employees: { name: string } | { name: string }[] | null;
  },
  folded: string,
): GlobalSearchItem {
  const pet = unwrapJoin(row.pets);
  const customer = unwrapJoin(row.customers);
  const employee = unwrapJoin(row.employees);
  const petName = pet?.name ?? "Pet";
  return {
    id: row.id,
    title: `${petName} — ${row.service_name_snapshot}`,
    subtitle: [customer?.name, employee?.name, formatDateTimeDisplay(row.scheduled_start)]
      .filter(Boolean)
      .join(" · "),
    href: `/dashboard/agenda/${row.id}`,
    rank: bestRank(
      [petName, row.service_name_snapshot, customer?.name, employee?.name],
      folded,
    ),
  };
}

async function searchServiceOrders(
  supabase: DbClient,
  companyId: string,
  term: string,
  folded: string,
): Promise<GlobalSearchItem[]> {
  const safe = escapeIlike(term);
  const foldedStatusKeys = Object.entries(SERVICE_ORDER_STATUS_LABEL)
    .filter(([, label]) => foldSearchText(label).includes(folded) || foldSearchText(label) === folded)
    .map(([status]) => status);

  const builder = supabase
    .from("service_orders")
    .select(
      `
      id, status,
      appointments!inner(
        service_name_snapshot, scheduled_start,
        pets(name), customers(name)
      )
    `,
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(GLOBAL_SEARCH_FETCH_PER_GROUP);

  // PostgREST nested or is limited — fetch recent candidates filtered by text on appointment fields
  const { data, error } = await builder.or(
    [
      `appointments.service_name_snapshot.ilike.%${safe}%`,
      `appointments.pets.name.ilike.%${safe}%`,
      `appointments.customers.name.ilike.%${safe}%`,
      ...(foldedStatusKeys.length > 0
        ? foldedStatusKeys.map((status) => `status.eq.${status}`)
        : []),
    ].join(","),
  );

  if (error || !data) {
    // Fallback: broader fetch then filter in memory (still limited)
    const fallback = await supabase
      .from("service_orders")
      .select(
        `
        id, status,
        appointments!inner(
          service_name_snapshot, scheduled_start,
          pets(name), customers(name)
        )
      `,
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(40);

    if (fallback.error || !fallback.data) {
      return [];
    }

    return fallback.data
      .map((row) => mapServiceOrderItem(row, folded))
      .filter((item) => item.rank <= 2)
      .slice(0, GLOBAL_SEARCH_FETCH_PER_GROUP);
  }

  return data.map((row) => mapServiceOrderItem(row, folded));
}

function mapServiceOrderItem(
  row: {
    id: string;
    status: string;
    appointments:
      | {
          service_name_snapshot: string;
          scheduled_start: string;
          pets: { name: string } | { name: string }[] | null;
          customers: { name: string } | { name: string }[] | null;
        }
      | {
          service_name_snapshot: string;
          scheduled_start: string;
          pets: { name: string } | { name: string }[] | null;
          customers: { name: string } | { name: string }[] | null;
        }[]
      | null;
  },
  folded: string,
): GlobalSearchItem {
  const appointment = unwrapJoin(row.appointments);
  const pet = unwrapJoin(appointment?.pets ?? null);
  const customer = unwrapJoin(appointment?.customers ?? null);
  const petName = pet?.name ?? "Pet";
  const serviceName = appointment?.service_name_snapshot ?? "Serviço";
  const statusLabel = SERVICE_ORDER_STATUS_LABEL[row.status] ?? row.status;

  return {
    id: row.id,
    title: `${petName} — ${serviceName}`,
    subtitle: [statusLabel, customer?.name, appointment?.scheduled_start
      ? formatDateTimeDisplay(appointment.scheduled_start)
      : null]
      .filter(Boolean)
      .join(" · "),
    href: `/dashboard/atendimentos/${row.id}`,
    rank: bestRank([petName, serviceName, customer?.name, statusLabel], folded),
  };
}

async function searchEmployees(
  supabase: DbClient,
  companyId: string,
  term: string,
  folded: string,
): Promise<GlobalSearchItem[]> {
  const safe = escapeIlike(term);
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, job_title")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .or(`name.ilike.%${safe}%,job_title.ilike.%${safe}%`)
    .order("name", { ascending: true })
    .limit(GLOBAL_SEARCH_FETCH_PER_GROUP);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    title: row.name,
    subtitle: row.job_title,
    href: `/dashboard/funcionarios/${row.id}`,
    rank: bestRank([row.name, row.job_title], folded),
  }));
}

async function searchServices(
  supabase: DbClient,
  companyId: string,
  term: string,
  folded: string,
): Promise<GlobalSearchItem[]> {
  const safe = escapeIlike(term);
  const { data, error } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .ilike("name", `%${safe}%`)
    .order("name", { ascending: true })
    .limit(GLOBAL_SEARCH_FETCH_PER_GROUP);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    title: row.name,
    subtitle: `${row.duration_minutes} min`,
    href: `/dashboard/servicos/${row.id}`,
    rank: rankMatch(row.name, folded),
  }));
}

async function searchProducts(
  supabase: DbClient,
  companyId: string,
  term: string,
  folded: string,
): Promise<GlobalSearchItem[]> {
  const safe = escapeIlike(term);
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, barcode, current_stock, stock_status")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,barcode.ilike.%${safe}%`)
    .order("name", { ascending: true })
    .limit(GLOBAL_SEARCH_FETCH_PER_GROUP);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    title: row.name,
    subtitle: [
      `Estoque: ${row.current_stock}`,
      row.sku ? `SKU ${row.sku}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    href: `/dashboard/estoque/${row.id}`,
    rank: bestRank([row.name, row.sku, row.barcode], folded),
  }));
}

async function searchSales(
  supabase: DbClient,
  companyId: string,
  term: string,
  folded: string,
): Promise<GlobalSearchItem[]> {
  const safe = escapeIlike(term);
  const asNumber = Number.parseInt(safe.replace(/\D/g, ""), 10);
  const filters = [`created_by_name.ilike.%${safe}%`];
  if (Number.isFinite(asNumber) && asNumber > 0) {
    filters.push(`sale_number.eq.${asNumber}`);
  }

  const [{ data: sales }, { data: matchingCustomers }] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_number, sold_at, status, customer_id, total_cents")
      .eq("company_id", companyId)
      .or(filters.join(","))
      .order("sold_at", { ascending: false })
      .limit(GLOBAL_SEARCH_FETCH_PER_GROUP),
    supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .ilike("name", `%${safe}%`)
      .limit(20),
  ]);

  const customerIds = (matchingCustomers ?? []).map((row) => row.id);
  let byCustomerSales: Array<{
    id: string;
    sale_number: number;
    sold_at: string;
    status: string;
    customer_id: string | null;
    total_cents: number;
  }> = [];

  if (customerIds.length > 0) {
    const { data } = await supabase
      .from("sales")
      .select("id, sale_number, sold_at, status, customer_id, total_cents")
      .eq("company_id", companyId)
      .in("customer_id", customerIds)
      .order("sold_at", { ascending: false })
      .limit(GLOBAL_SEARCH_FETCH_PER_GROUP);
    byCustomerSales = data ?? [];
  }

  const merged = new Map<string, (typeof byCustomerSales)[number]>();
  for (const row of [...(sales ?? []), ...byCustomerSales]) {
    merged.set(row.id, row);
  }

  const allCustomerIds = [
    ...new Set(
      [...merged.values()]
        .map((row) => row.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const nameById = new Map<string, string>();
  for (const row of matchingCustomers ?? []) {
    nameById.set(row.id, row.name);
  }

  if (allCustomerIds.some((id) => !nameById.has(id))) {
    const missing = allCustomerIds.filter((id) => !nameById.has(id));
    const { data: extra } = await supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", missing);
    for (const row of extra ?? []) {
      nameById.set(row.id, row.name);
    }
  }

  return [...merged.values()]
    .slice(0, GLOBAL_SEARCH_FETCH_PER_GROUP)
    .map((row) => {
      const customerName = row.customer_id ? (nameById.get(row.customer_id) ?? null) : null;
      const title = `Venda #${row.sale_number}`;
      return {
        id: row.id,
        title,
        subtitle: [customerName, formatDateTimeDisplay(row.sold_at)].filter(Boolean).join(" · "),
        href: `/dashboard/pdv/vendas/${row.id}`,
        rank: bestRank([String(row.sale_number), customerName, title], folded),
      };
    });
}

async function searchPackages(
  supabase: DbClient,
  companyId: string,
  term: string,
  folded: string,
): Promise<GlobalSearchItem[]> {
  const safe = escapeIlike(term);

  const [templates, sold] = await Promise.all([
    supabase
      .from("service_packages")
      .select("id, name, active")
      .eq("company_id", companyId)
      .ilike("name", `%${safe}%`)
      .order("name", { ascending: true })
      .limit(GLOBAL_SEARCH_FETCH_PER_GROUP),
    supabase
      .from("customer_service_packages")
      .select("id, package_name_snapshot, status, pet_id, customer_id")
      .eq("company_id", companyId)
      .ilike("package_name_snapshot", `%${safe}%`)
      .order("purchased_at", { ascending: false })
      .limit(GLOBAL_SEARCH_FETCH_PER_GROUP),
  ]);

  const items: GlobalSearchItem[] = [];

  for (const row of templates.data ?? []) {
    items.push({
      id: row.id,
      title: row.name,
      subtitle: row.active ? "Modelo de pacote" : "Modelo inativo",
      href: `/dashboard/servicos/pacotes/${row.id}`,
      rank: rankMatch(row.name, folded),
    });
  }

  const petIds = [...new Set((sold.data ?? []).map((row) => row.pet_id))];
  const customerIds = [...new Set((sold.data ?? []).map((row) => row.customer_id))];
  const petNames = new Map<string, string>();
  const customerNames = new Map<string, string>();

  if (petIds.length > 0) {
    const { data: pets } = await supabase
      .from("pets")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", petIds);
    for (const pet of pets ?? []) {
      petNames.set(pet.id, pet.name);
    }
  }

  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", customerIds);
    for (const customer of customers ?? []) {
      customerNames.set(customer.id, customer.name);
    }
  }

  for (const row of sold.data ?? []) {
    const petName = petNames.get(row.pet_id) ?? null;
    const customerName = customerNames.get(row.customer_id) ?? null;
    items.push({
      id: `sold-${row.id}`,
      title: row.package_name_snapshot,
      subtitle: [petName, customerName, row.status].filter(Boolean).join(" · "),
      href: `/dashboard/servicos/pacotes`,
      rank: bestRank([row.package_name_snapshot, petName, customerName], folded),
    });
  }

  if (templates.error && sold.error) {
    return [];
  }

  return items.slice(0, GLOBAL_SEARCH_FETCH_PER_GROUP);
}

/**
 * Busca global server-side. companyId deve vir do contexto autenticado.
 */
export async function runGlobalSearch(input: {
  supabase: DbClient;
  companyId: string;
  membership: MembershipAccess;
  query: string;
}): Promise<GlobalSearchResult> {
  const prepared = prepareSearchQuery(input.query);

  if (prepared.term.length < GLOBAL_SEARCH_MIN_CHARS) {
    return { query: prepared.term, groups: [] };
  }

  const can = (group: GlobalSearchGroupId) =>
    hasPermission(input.membership, GROUP_PERMISSION[group]);

  const tasks: Array<Promise<GlobalSearchGroup | null>> = [];

  if (can("customers")) {
    tasks.push(
      searchCustomers(
        input.supabase,
        input.companyId,
        prepared.term,
        prepared.folded,
        prepared.phoneDigits,
      ).then((items) => (items.length ? finalizeGroup("customers", items) : null)),
    );
  }
  if (can("pets")) {
    tasks.push(
      searchPets(input.supabase, input.companyId, prepared.term, prepared.folded).then((items) =>
        items.length ? finalizeGroup("pets", items) : null,
      ),
    );
  }
  if (can("appointments")) {
    tasks.push(
      searchAppointments(
        input.supabase,
        input.companyId,
        prepared.term,
        prepared.folded,
      ).then((items) => (items.length ? finalizeGroup("appointments", items) : null)),
    );
  }
  if (can("service_orders")) {
    tasks.push(
      searchServiceOrders(
        input.supabase,
        input.companyId,
        prepared.term,
        prepared.folded,
      ).then((items) => (items.length ? finalizeGroup("service_orders", items) : null)),
    );
  }
  if (can("employees")) {
    tasks.push(
      searchEmployees(
        input.supabase,
        input.companyId,
        prepared.term,
        prepared.folded,
      ).then((items) => (items.length ? finalizeGroup("employees", items) : null)),
    );
  }
  if (can("services")) {
    tasks.push(
      searchServices(
        input.supabase,
        input.companyId,
        prepared.term,
        prepared.folded,
      ).then((items) => (items.length ? finalizeGroup("services", items) : null)),
    );
  }
  if (can("products")) {
    tasks.push(
      searchProducts(
        input.supabase,
        input.companyId,
        prepared.term,
        prepared.folded,
      ).then((items) => (items.length ? finalizeGroup("products", items) : null)),
    );
  }
  if (can("sales")) {
    tasks.push(
      searchSales(input.supabase, input.companyId, prepared.term, prepared.folded).then((items) =>
        items.length ? finalizeGroup("sales", items) : null,
      ),
    );
  }
  if (can("packages")) {
    tasks.push(
      searchPackages(
        input.supabase,
        input.companyId,
        prepared.term,
        prepared.folded,
      ).then((items) => (items.length ? finalizeGroup("packages", items) : null)),
    );
  }

  const settled = await Promise.all(tasks);
  const order = Object.keys(GLOBAL_SEARCH_GROUP_LABELS) as GlobalSearchGroupId[];
  const groups = order
    .map((id) => settled.find((group) => group?.id === id) ?? null)
    .filter((group): group is GlobalSearchGroup => group !== null);

  return { query: prepared.term, groups };
}
