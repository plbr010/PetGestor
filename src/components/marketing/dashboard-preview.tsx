import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  demoDashboardStats,
  demoUpcomingAppointments,
} from "@/config/demo-data";

export function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div
        className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-2xl"
        aria-hidden="true"
      />
      <div className="surface-card relative overflow-hidden shadow-xl">
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-destructive/70" />
            <span className="size-2.5 rounded-full bg-warning/80" />
            <span className="size-2.5 rounded-full bg-success/80" />
          </div>
          <p className="mx-auto text-xs font-medium text-muted-foreground">
            Prévia do dashboard — dados demonstrativos
          </p>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            {demoDashboardStats.slice(0, 4).map((stat) => (
              <Card key={stat.id} className="border bg-background/80 py-0 shadow-none">
                <CardHeader className="gap-1 px-3 pb-1 pt-3">
                  <CardDescription className="text-[11px]">{stat.label}</CardDescription>
                  <CardTitle className="text-xl">{stat.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card className="border bg-background/80 shadow-none">
            <CardHeader className="gap-1 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Próximos atendimentos</CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  Demo
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-3 pb-3">
              {demoUpcomingAppointments.map((item, index) => (
                <div key={item.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.pet}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.service}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-primary">{item.time}</p>
                      <StatusBadge status={item.status} className="mt-1 text-[10px]" />
                    </div>
                  </div>
                  {index < demoUpcomingAppointments.length - 1 ? (
                    <Separator className="mt-3" />
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
