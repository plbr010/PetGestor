import { ArchiveEmployeeButton } from "@/features/employees/components/archive-employee-button";
import { ToggleEmployeeActiveButton } from "@/features/employees/components/toggle-employee-active-button";
import { EmployeeAccessPanel } from "@/features/employees/access/components/employee-access-panel";
import { getEmployeeAccessState } from "@/features/employees/access/queries";
import { requireEmployeeById } from "@/features/employees/queries";
import {
  formatWorkingHourRange,
  getWeekdayLabel,
  schedulableLabel,
} from "@/features/employees/utils";
import { requirePermission, checkPermission } from "@/lib/auth/require-permission";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateTimeDisplay } from "@/lib/pet-display";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EmployeeDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ atualizado?: string }>;
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: EmployeeDetailPageProps) {
  const context = await requirePermission("employees.view");
  const { id } = await params;
  const query = await searchParams;
  const employee = await requireEmployeeById(context.membership.company.id, id);
  const canManageAccess = checkPermission(context, "employees.manage");
  const access = canManageAccess
    ? await getEmployeeAccessState(context.membership.company.id, id)
    : null;

  return (
    <>
      <DashboardHeader title={employee.name} description="detalhes do funcionário" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {query.atualizado === "1" ? (
          <FormFeedback message="Funcionário atualizado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/dashboard/funcionarios/${id}/editar`} variant="outline">
              Editar
            </ButtonLink>
            <ToggleEmployeeActiveButton employeeId={id} active={employee.active} />
          </div>
          <ArchiveEmployeeButton employeeId={id} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Informações gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Cargo</span>
                <span className="font-medium">{employee.job_title ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Telefone</span>
                <span className="font-medium">
                  {employee.phone ? formatPhoneDisplay(employee.phone) : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">E-mail</span>
                <span className="font-medium">{employee.email ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={employee.active ? "default" : "secondary"}>
                  {employee.active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Agenda</span>
                <span className="font-medium">
                  {schedulableLabel(employee.can_be_scheduled, employee.active)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Cadastrado em</span>
                <span className="font-medium">{formatDateTimeDisplay(employee.created_at)}</span>
              </div>
              {employee.notes ? (
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-muted-foreground">Observações</p>
                  <p className="mt-1 whitespace-pre-wrap">{employee.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Serviços executados</CardTitle>
              <CardDescription>
                {employee.services.length === 0
                  ? "Nenhum serviço vinculado."
                  : `${employee.services.length} serviço(s) vinculado(s).`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {employee.services.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este funcionário ainda não executa serviços cadastrados.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {employee.services.map((service) => (
                    <Badge key={service.serviceId} variant="secondary">
                      {service.serviceName}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Horários semanais</CardTitle>
            <CardDescription>Jornada padrão — um intervalo por dia.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {employee.workingHours.map((hour) => (
              <div
                key={hour.id}
                className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm"
              >
                <span className="font-medium">{getWeekdayLabel(hour.weekday)}</span>
                <span className="text-muted-foreground">
                  {formatWorkingHourRange(hour.enabled, hour.start_time, hour.end_time)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {canManageAccess && access ? (
          <EmployeeAccessPanel
            employeeId={id}
            employeeEmail={employee.email}
            access={access}
          />
        ) : null}
      </main>
    </>
  );
}
