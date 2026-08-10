import { AppointmentForm } from "@/features/appointments/components/appointment-form";
import { getAppointmentFormOptions } from "@/features/appointments/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewAppointmentPage() {
  const context = await requireCompanyContext();
  const options = await getAppointmentFormOptions(
    context.membership.company.id,
    context.membership.company.timezone,
  );

  return (
    <>
      <DashboardHeader title="Novo agendamento" description="criar atendimento" />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Informações do agendamento</CardTitle>
          </CardHeader>
          <CardContent>
            <AppointmentForm mode="create" options={options} cancelHref="/dashboard/agenda" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
