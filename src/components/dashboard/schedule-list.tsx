import { StatusBadge } from "@/components/shared/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { demoTodaySchedule } from "@/config/demo-data";

export function ScheduleList() {
  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Agenda de hoje</CardTitle>
        <CardDescription>Horários simulados para demonstração</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {demoTodaySchedule.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <span className="text-[10px] font-medium uppercase">Hora</span>
                  <span className="text-sm font-bold">{item.time}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.pet}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({item.breed})
                    </span>
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {item.service} · {item.tutor}
                  </p>
                </div>
              </div>
              <StatusBadge status={item.status} className="self-start sm:self-center" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
