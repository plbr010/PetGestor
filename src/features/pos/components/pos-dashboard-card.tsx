import { ShoppingCart } from "lucide-react";

import type { PosDashboardMetrics } from "@/features/pos/types";
import { formatAmountCents } from "@/features/finance/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";

export function PosDashboardCard({ metrics }: { metrics: PosDashboardMetrics }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">PDV</CardTitle>
          <CardDescription>Vendas de produtos no balcão</CardDescription>
        </div>
        <ShoppingCart className="size-5 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Vendas hoje</p>
            <p className="text-xl font-semibold">{metrics.salesCountToday}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Valor hoje</p>
            <p className="text-xl font-semibold">
              {formatAmountCents(metrics.totalSoldTodayCents)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/dashboard/pdv" className="min-h-11 flex-1">
            Abrir PDV
          </ButtonLink>
          <ButtonLink href="/dashboard/pdv/vendas" variant="outline" className="min-h-11 flex-1">
            Ver vendas
          </ButtonLink>
        </div>
      </CardContent>
    </Card>
  );
}
