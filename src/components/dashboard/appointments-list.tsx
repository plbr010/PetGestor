import { StatusBadge } from "@/components/shared/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { demoUpcomingAppointments } from "@/config/demo-data";

export function AppointmentsList() {
  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Próximos atendimentos</CardTitle>
        <CardDescription>Agenda demonstrativa do dia</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {demoUpcomingAppointments.map((item, index) => (
          <div key={item.id}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{item.pet}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {item.service} · {item.tutor}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-primary">{item.time}</span>
                <StatusBadge status={item.status} />
              </div>
            </div>
            {index < demoUpcomingAppointments.length - 1 ? (
              <Separator className="mt-4" />
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
