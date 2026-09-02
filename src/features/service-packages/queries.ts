import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import {
  resolveDisplayStatus,
  sumPackageQuantities,
} from "@/features/service-packages/utils";
import type {
  CustomerPackageListItem,
  CustomerPackageUsageItem,
  PackageCreditOption,
  ServicePackageDetail,
  ServicePackageListItem,
} from "@/features/service-packages/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getServicePackages(params: {
  companyId: string;
  activeOnly?: boolean;
}): Promise<ServicePackageListItem[]> {
  noStore();

  const supabase = await createSupabaseServerClient();
  let builder = supabase
    .from("service_packages")
    .select(
      `
      id, name, description, price_cents, validity_days, active, created_at,
      service_package_items!service_package_items_package_company_fkey(id)
    `,
    )
    .eq("company_id", params.companyId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (params.activeOnly) {
    builder = builder.eq("active", true);
  }

  const { data, error } = await builder;

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const items = row.service_package_items as unknown as Array<{ id: string }> | null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price_cents: row.price_cents,
      validity_days: row.validity_days,
      active: row.active,
      created_at: row.created_at,
      itemCount: items?.length ?? 0,
    };
  });
}

export async function getServicePackageById(
  companyId: string,
  packageId: string,
): Promise<ServicePackageDetail | null> {
  if (!isValidUuid(packageId)) {
    return null;
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("service_packages")
    .select(
      `
      id, name, description, price_cents, validity_days, active, created_at,
      service_package_items!service_package_items_package_company_fkey(
        id, service_id, quantity,
        services!service_package_items_service_company_fkey(name)
      )
    `,
    )
    .eq("company_id", companyId)
    .eq("id", packageId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const rawItems = data.service_package_items as unknown as
    | Array<{
        id: string;
        service_id: string;
        quantity: number;
        services: { name: string } | { name: string }[];
      }>
    | null;

  const items =
    rawItems?.map((item) => {
      const service = unwrapJoin(item.services);
      return {
        id: item.id,
        service_id: item.service_id,
        service_name: service?.name ?? "—",
        quantity: item.quantity,
      };
    }) ?? [];

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    price_cents: data.price_cents,
    validity_days: data.validity_days,
    active: data.active,
    created_at: data.created_at,
    itemCount: items.length,
    items,
  };
}

export async function requireServicePackageById(companyId: string, packageId: string) {
  const pkg = await getServicePackageById(companyId, packageId);

  if (!pkg) {
    notFound();
  }

  return pkg;
}

function mapCustomerPackageRow(
  row: {
    id: string;
    package_name_snapshot: string;
    pet_id: string;
    customer_id: string;
    status: CustomerPackageListItem["status"];
    starts_at: string;
    expires_at: string;
    price_cents_snapshot: number;
    purchased_at: string;
    pets: { name: string } | { name: string }[];
    customers: { name: string } | { name: string }[];
    customer_service_package_items:
      | Array<{
          id: string;
          service_id: string;
          service_name_snapshot: string;
          quantity_total: number;
          quantity_used: number;
        }>
      | null;
  },
  timeZone: string,
): CustomerPackageListItem {
  const pet = unwrapJoin(row.pets);
  const customer = unwrapJoin(row.customers);

  const items =
    row.customer_service_package_items?.map((item) => ({
      id: item.id,
      service_id: item.service_id,
      service_name: item.service_name_snapshot,
      quantity_total: item.quantity_total,
      quantity_used: item.quantity_used,
      quantity_remaining: item.quantity_total - item.quantity_used,
    })) ?? [];

  const totals = sumPackageQuantities(items);
  const displayStatus = resolveDisplayStatus(
    row.status,
    row.expires_at,
    totals.remaining,
    timeZone,
  );

  return {
    id: row.id,
    package_name_snapshot: row.package_name_snapshot,
    pet_id: row.pet_id,
    customer_id: row.customer_id,
    pet_name: pet?.name ?? "—",
    customer_name: customer?.name ?? "—",
    status: displayStatus,
    starts_at: row.starts_at,
    expires_at: row.expires_at,
    price_cents_snapshot: row.price_cents_snapshot,
    purchased_at: row.purchased_at,
    items,
    total_used: totals.used,
    total_quantity: totals.total,
    total_remaining: totals.remaining,
  };
}

export async function getCustomerPackagesForPet(
  companyId: string,
  petId: string,
  timeZone: string,
): Promise<CustomerPackageListItem[]> {
  if (!isValidUuid(petId)) {
    return [];
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("customer_service_packages")
    .select(
      `
      id, package_name_snapshot, pet_id, customer_id, status,
      starts_at, expires_at, price_cents_snapshot, purchased_at,
      pets!customer_service_packages_pet_customer_company_fkey(name),
      customers!customer_service_packages_customer_company_fkey(name),
      customer_service_package_items!customer_service_package_items_package_company_fkey(
        id, service_id, service_name_snapshot, quantity_total, quantity_used
      )
    `,
    )
    .eq("company_id", companyId)
    .eq("pet_id", petId)
    .order("expires_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) =>
    mapCustomerPackageRow(row as unknown as Parameters<typeof mapCustomerPackageRow>[0], timeZone),
  );
}

export async function getCustomerPackageUsages(
  companyId: string,
  customerPackageId: string,
): Promise<CustomerPackageUsageItem[]> {
  if (!isValidUuid(customerPackageId)) {
    return [];
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("customer_service_package_usages")
    .select(
      `
      id, used_at, status, service_order_id,
      customer_service_package_items!customer_service_package_usages_item_company_fkey(service_name_snapshot)
    `,
    )
    .eq("company_id", companyId)
    .eq("customer_package_id", customerPackageId)
    .order("used_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const item = unwrapJoin(
      row.customer_service_package_items as unknown as
        | { service_name_snapshot: string }
        | { service_name_snapshot: string }[],
    );

    return {
      id: row.id,
      service_name: item?.service_name_snapshot ?? "—",
      used_at: row.used_at,
      status: row.status as CustomerPackageUsageItem["status"],
      service_order_id: row.service_order_id,
    };
  });
}

export async function getPackageCreditsForServiceOrder(
  companyId: string,
  serviceOrderId: string,
  timeZone: string,
): Promise<PackageCreditOption[]> {
  if (!isValidUuid(serviceOrderId)) {
    return [];
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data: order, error: orderError } = await supabase
    .from("service_orders")
    .select(
      `
      id,
      appointments!service_orders_appointment_company_fkey(pet_id, service_id, price_cents_snapshot)
    `,
    )
    .eq("company_id", companyId)
    .eq("id", serviceOrderId)
    .maybeSingle();

  if (orderError || !order) {
    return [];
  }

  const appointment = unwrapJoin(
    order.appointments as unknown as
      | { pet_id: string; service_id: string; price_cents_snapshot: number }
      | { pet_id: string; service_id: string; price_cents_snapshot: number }[],
  );

  if (!appointment || appointment.price_cents_snapshot === 0) {
    return [];
  }

  const packages = await getCustomerPackagesForPet(companyId, appointment.pet_id, timeZone);

  const options: PackageCreditOption[] = [];

  for (const pkg of packages) {
    if (pkg.status !== "active") {
      continue;
    }

    for (const item of pkg.items) {
      if (item.service_id !== appointment.service_id) {
        continue;
      }

      if (item.quantity_remaining <= 0) {
        continue;
      }

      options.push({
        customerPackageId: pkg.id,
        packageName: pkg.package_name_snapshot,
        serviceName: item.service_name,
        remaining: item.quantity_remaining,
        expiresAt: pkg.expires_at,
      });
    }
  }

  return options;
}

export async function getPackageUsageForServiceOrder(
  companyId: string,
  serviceOrderId: string,
) {
  if (!isValidUuid(serviceOrderId)) {
    return null;
  }

  noStore();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("customer_service_package_usages")
    .select("id, status, customer_package_id, used_at")
    .eq("company_id", companyId)
    .eq("service_order_id", serviceOrderId)
    .eq("status", "consumed")
    .maybeSingle();

  if (data) {
    return data;
  }

  const { data: order } = await supabase
    .from("service_orders")
    .select("appointment_id")
    .eq("company_id", companyId)
    .eq("id", serviceOrderId)
    .maybeSingle();

  if (!order?.appointment_id) {
    return null;
  }

  const { data: byAppointment } = await supabase
    .from("customer_service_package_usages")
    .select("id, status, customer_package_id, used_at")
    .eq("company_id", companyId)
    .eq("appointment_id", order.appointment_id)
    .eq("status", "consumed")
    .maybeSingle();

  return byAppointment ?? null;
}
