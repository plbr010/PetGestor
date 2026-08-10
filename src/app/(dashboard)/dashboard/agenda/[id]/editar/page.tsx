import { updateAppointmentAction } from "@/features/appointments/actions";
import { AppointmentForm } from "@/features/appointments/components/appointment-form";
import {
  getAppointmentFormOptions,
  requireAppointmentById,
} from "@/features/appointments/queries";
import { isEditableStatus } from "@/features/appointments/status";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EditAppointmentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAppointmentPage({ params }: EditAppointmentPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const appointment = await requireAppointmentById(context.membership.company.id, id);
  const options = await getAppointmentFormOptions(
    context.membership.company.id,
    context.membership.company.timezone,
  );

  if (!isEditableStatus(appointment.status)) {
    return (
      <>
        <DashboardHeader title="Editar agendamento" description="indisponível" />
        <main className="flex-1 p-4 sm:p-6">
          <EmptyState
            title="Agendamento não editável"
            description="Somente agendamentos com status Agendado ou Confirmado podem ser editados."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <DashboardHeader title="Editar agendamento" description={appointment.pet.name} />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Reagendar ou alterar atendimento</CardTitle>
          </CardHeader>
          <CardContent>
            <AppointmentForm
              mode="edit"
              options={options}
              appointment={appointment}
              cancelHref={`/dashboard/agenda/${id}`}
              action={updateAppointmentAction.bind(null, id)}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
