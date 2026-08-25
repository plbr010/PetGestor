import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { toQuantity } from "@/features/inventory/stock-engine";
import type { ServiceRecipeItem } from "@/features/services/recipe-types";
import type { ProductUnit } from "@/types/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";

export async function getServiceRecipes(
  companyId: string,
  serviceId: string,
): Promise<ServiceRecipeItem[]> {
  noStore();

  if (!isValidUuid(companyId) || !isValidUuid(serviceId)) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_product_recipes")
    .select("id, product_id, quantity, products(name, unit)")
    .eq("company_id", companyId)
    .eq("service_id", serviceId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    return {
      id: row.id,
      productId: row.product_id,
      productName: product?.name ?? "Produto",
      unit: (product?.unit ?? "unit") as ProductUnit,
      quantity: toQuantity(row.quantity),
    };
  });
}
