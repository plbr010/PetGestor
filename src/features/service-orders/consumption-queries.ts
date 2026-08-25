import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { toQuantity } from "@/features/inventory/stock-engine";
import type { ServiceOrderConsumptionItem } from "@/features/services/recipe-types";
import type { ProductUnit } from "@/types/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";

export async function getServiceOrderConsumptions(
  companyId: string,
  serviceOrderId: string,
): Promise<ServiceOrderConsumptionItem[]> {
  noStore();

  if (!isValidUuid(companyId) || !isValidUuid(serviceOrderId)) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_order_consumptions")
    .select(
      "id, product_id, product_name_snapshot, unit, quantity, unit_cost_cents_snapshot, source, consumed_at, stock_movement_id",
    )
    .eq("company_id", companyId)
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name_snapshot,
    unit: row.unit as ProductUnit,
    quantity: toQuantity(row.quantity),
    unitCostCentsSnapshot: row.unit_cost_cents_snapshot,
    source: row.source === "recipe" ? "recipe" : "manual",
    consumedAt: row.consumed_at,
    stockMovementId: row.stock_movement_id,
  }));
}

export async function ensureServiceOrderConsumptionsSeeded(
  serviceOrderId: string,
): Promise<void> {
  if (!isValidUuid(serviceOrderId)) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("seed_service_order_consumptions", {
    p_service_order_id: serviceOrderId,
  });
}
