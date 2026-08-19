import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportKpiCardProps = {
  label: string;
  value: string;
  prevValue?: string | null;
  changePercent?: number | null;
  icon?: LucideIcon;
};

export function ReportKpiCard({
  label,
  value,
  prevValue,
  changePercent,
  icon: Icon,
}: ReportKpiCardProps) {
  const hasChange = changePercent != null && prevValue != null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {hasChange ? (
          <div className="mt-1 flex items-center gap-1 text-xs">
            {changePercent > 0 ? (
              <>
                <TrendingUp className="size-3.5 text-emerald-600" />
                <span className="text-emerald-600">
                  +{changePercent.toFixed(1).replace(".", ",")}%
                </span>
              </>
            ) : changePercent < 0 ? (
              <>
                <TrendingDown className="size-3.5 text-rose-600" />
                <span className="text-rose-600">
                  {changePercent.toFixed(1).replace(".", ",")}%
                </span>
              </>
            ) : (
              <>
                <Minus className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">0%</span>
              </>
            )}
            <span className="text-muted-foreground">vs {prevValue}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
