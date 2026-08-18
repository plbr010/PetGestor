import { Package } from "lucide-react";

import type { InventoryDashboardAlert } from "@/features/inventory/types";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InventoryDashboardCard({
  lowStockCount,
  outOfStockCount,
}: InventoryDashboardAlert) {
  const hasAlert = lowStockCount > 0 || outOfStockCount > 0;

  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Estoque</CardTitle>
          <CardDescription>
            {hasAlert ? "Há produtos que precisam de atenção." : "Nenhum alerta de estoque."}
          </CardDescription>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Package className="size-5" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid flex-1 grid-cols-2 gap-3 text-sm">
          <p>
            <span className="block text-2xl font-semibold">{lowStockCount}</span>
            estoque baixo
          </p>
          <p>
            <span className="block text-2xl font-semibold">{outOfStockCount}</span>
            sem estoque
          </p>
        </div>
        <ButtonLink href="/dashboard/estoque" className="min-h-11 w-full sm:w-auto">
          Ver estoque
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
