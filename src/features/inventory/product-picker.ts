import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { toQuantity } from "@/features/inventory/stock-engine";
import type { ProductUnit } from "@/types/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/security/uuid";

export type ProductPickerOption = {
  id: string;
  name: string;
  unit: ProductUnit;
  currentStock: number;
  costPriceCents: number;
  trackStock: boolean;
};

/** Lista enxuta de produtos ativos para seleção de insumos (sem paginação pesada). */
export async function getProductPickerOptions(
  companyId: string,
  limit = 200,
): Promise<ProductPickerOption[]> {
  noStore();

  if (!isValidUuid(companyId)) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, unit, current_stock, cost_price_cents, track_stock")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    unit: row.unit as ProductUnit,
    currentStock: toQuantity(row.current_stock),
    costPriceCents: row.cost_price_cents,
    trackStock: row.track_stock,
  }));
}
