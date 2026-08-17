import { formatAmountCents } from "@/features/finance/utils";
import type { PetHistorySummary } from "@/features/pets/history/types";
import { formatUtcDateInTimezone, formatUtcInTimezone } from "@/lib/timezone";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PetSummaryCardsProps = {
  summary: PetHistorySummary;
  timeZone: string;
};

export function PetSummaryCards({ summary, timeZone }: PetSummaryCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard
        title="Último atendimento"
        value={
          summary.lastServiceAt
            ? `${formatUtcDateInTimezone(summary.lastServiceAt, timeZone)} · ${formatUtcInTimezone(summary.lastServiceAt, timeZone)}`
            : "—"
        }
        hint={summary.lastServiceName ?? "Nenhum atendimento concluído"}
      />
      <SummaryCard
        title="Próximo agendamento"
        value={
          summary.nextAppointmentAt
            ? `${formatUtcDateInTimezone(summary.nextAppointmentAt, timeZone)} · ${formatUtcInTimezone(summary.nextAppointmentAt, timeZone)}`
            : "—"
        }
        hint={summary.nextAppointmentServiceName ?? "Nenhum agendamento futuro"}
      />
      <SummaryCard
        title="Total de agendamentos"
        value={String(summary.totalAppointments)}
        hint={`${summary.totalCompletedServices} concluído(s)`}
      />
      <SummaryCard
        title="Total gasto"
        value={
          summary.totalSpentCents > 0
            ? formatAmountCents(summary.totalSpentCents)
            : "—"
        }
        hint="Atendimentos pagos + pacotes"
      />
      <SummaryCard
        title="Serviço mais realizado"
        value={summary.topServiceName ?? "—"}
        hint={
          summary.topServiceCount > 0
            ? `${summary.topServiceCount} vez(es)`
            : "Sem histórico suficiente"
        }
      />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
