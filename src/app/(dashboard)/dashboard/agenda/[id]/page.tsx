import { AppointmentStatusActions } from "@/features/appointments/components/appointment-status-actions";
import { AppointmentRecurrenceBadge } from "@/features/appointments/components/appointment-recurrence-badge";
import { AppointmentStatusBadge } from "@/features/appointments/components/appointment-status-badge";
import { requireAppointmentById } from "@/features/appointments/queries";
import { isAppointmentCheckInEligible } from "@/features/service-orders/status";
import { CheckInAppointmentPanel } from "@/features/service-orders/components/check-in-appointment-panel";
import { getServiceOrderByAppointmentId } from "@/features/service-orders/queries";
import {
  formatAppointmentDateLabel,
  formatAppointmentTimeRange,
  formatPetSizeLabel,
  formatPriceSnapshot,
} from "@/features/appointments/utils";
import { formatDurationLabel } from "@/features/services/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatUtcDateInTimezone } from "@/lib/timezone";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AppointmentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    atualizado?: string;
    recorrencia?: string;
    criados?: string;
    pulados?: string;
    serie?: string;
    ok?: string;
  }>;
};

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: AppointmentDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const appointment = await requireAppointmentById(context.membership.company.id, id);
  const localDate = formatUtcDateInTimezone(appointment.scheduled_start, timeZone);
  const existingServiceOrder = await getServiceOrderByAppointmentId(
    context.membership.company.id,
    id,
  );
  const showCheckIn =
    existingServiceOrder !== null || isAppointmentCheckInEligible(appointment.status);

  const recurrenceCreated = Number(query.criados ?? 0);
  const recurrenceSkipped = Number(query.pulados ?? 0);

  return (
    <>
      <DashboardHeader title="Agendamento" description={appointment.pet.name} />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {query.atualizado === "1" ? (
          <FormFeedback message="Agendamento atualizado com sucesso." variant="success" />
        ) : null}
        {query.recorrencia === "1" && recurrenceCreated > 0 ? (
          <FormFeedback
            message={`${recurrenceCreated} agendamento${recurrenceCreated === 1 ? "" : "s"} criado${recurrenceCreated === 1 ? "" : "s"} com sucesso.`}
            variant="success"
          />
        ) : null}
        {query.recorrencia === "parcial" ? (
          <FormFeedback
            message={`${recurrenceCreated} de ${recurrenceCreated + recurrenceSkipped} agendamentos foram criados. ${recurrenceSkipped} não puderam ser criados por conflito.`}
            variant="error"
          />
        ) : null}
        {query.serie === "parcial" ? (
          <FormFeedback
            message={`Série parcialmente atualizada. ${query.ok ?? "1"} ok, ${query.pulados ?? "0"} com conflito.`}
            variant="error"
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <AppointmentStatusBadge status={appointment.status} />
          {appointment.recurrence_id ? <AppointmentRecurrenceBadge /> : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Atendimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Pet" value={appointment.pet.name} />
              <Row label="Tutor" value={appointment.customer.name} />
              <Row
                label="Telefone"
                value={formatPhoneDisplay(appointment.customer.phone)}
              />
              <Row label="Serviço" value={appointment.service_name_snapshot} />
              <Row label="Preço" value={formatPriceSnapshot(appointment.price_cents_snapshot)} />
              {appointment.customer_package_name ? (
                <Row label="Pacote" value={appointment.customer_package_name} />
              ) : null}
              <Row
                label="Duração"
                value={formatDurationLabel(appointment.duration_minutes_snapshot)}
              />
              <Row label="Porte" value={formatPetSizeLabel(appointment.pet_size)} />
              <Row label="Profissional" value={appointment.employee.name} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Horário</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Data" value={formatAppointmentDateLabel(localDate, timeZone)} />
              <Row
                label="Horário"
                value={formatAppointmentTimeRange(
                  appointment.scheduled_start,
                  appointment.scheduled_end,
                  timeZone,
                )}
              />
              {appointment.recurrence_id ? (
                <Row
                  label="Recorrência"
                  value={
                    appointment.recurrence_index
                      ? `Ocorrência ${appointment.recurrence_index}`
                      : "Série recorrente"
                  }
                />
              ) : null}
              {appointment.notes ? (
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-muted-foreground">Observações</p>
                  <p className="mt-1 whitespace-pre-wrap">{appointment.notes}</p>
                </div>
              ) : null}
              {appointment.cancellation_reason ? (
                <div className="rounded-lg bg-destructive/5 p-3">
                  <p className="text-muted-foreground">Motivo do cancelamento</p>
                  <p className="mt-1 whitespace-pre-wrap">{appointment.cancellation_reason}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {showCheckIn ? (
          <CheckInAppointmentPanel
            appointmentId={appointment.id}
            existingServiceOrderId={existingServiceOrder?.id}
          />
        ) : null}

        <AppointmentStatusActions
          appointmentId={appointment.id}
          status={appointment.status}
          isRecurring={Boolean(appointment.recurrence_id)}
        />
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
