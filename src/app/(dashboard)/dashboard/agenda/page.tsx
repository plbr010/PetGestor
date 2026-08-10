import { AgendaDayView } from "@/features/appointments/components/agenda-day-view";
import { AgendaFilters } from "@/features/appointments/components/agenda-filters";
import { AgendaNav } from "@/features/appointments/components/agenda-nav";
import { AgendaWeekView } from "@/features/appointments/components/agenda-week-view";
import {
  getAppointmentsForDay,
  getAppointmentsForWeek,
  getSchedulableEmployeesForFilter,
} from "@/features/appointments/queries";
import { parseAppointmentStatusFilter } from "@/features/appointments/status";
import { getWeekRange, parseAgendaDate, parseAgendaView } from "@/features/appointments/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { isValidUuid } from "@/lib/security/uuid";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AgendaPageProps = {
  searchParams: Promise<{
    date?: string;
    view?: string;
    employee?: string;
    status?: string;
  }>;
};

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const context = await requireCompanyContext();
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const date = parseAgendaDate(query.date, timeZone);
  const view = parseAgendaView(query.view);
  const status = parseAppointmentStatusFilter(query.status);
  const employeeId =
    query.employee && isValidUuid(query.employee) ? query.employee : undefined;

  const filters = { employeeId, status };
  const weekRange = getWeekRange(date);

  const [appointments, employees] = await Promise.all([
    view === "week"
      ? getAppointmentsForWeek(context.membership.company.id, weekRange.start, timeZone, filters)
      : getAppointmentsForDay(context.membership.company.id, date, timeZone, filters),
    getSchedulableEmployeesForFilter(context.membership.company.id),
  ]);

  return (
    <>
      <DashboardHeader
        title="Agenda"
        description="Organize os atendimentos e horários do seu pet shop."
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <AgendaNav
            date={date}
            view={view}
            timeZone={timeZone}
            employeeId={employeeId}
            status={status}
          />
          <ButtonLink href="/dashboard/agenda/novo">Novo agendamento</ButtonLink>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <AgendaFilters
              date={date}
              view={view}
              employees={employees}
              employeeId={employeeId}
              status={status}
            />
          </CardContent>
        </Card>

        {view === "week" ? (
          <AgendaWeekView
            appointments={appointments}
            weekDates={weekRange.dates}
            timeZone={timeZone}
          />
        ) : (
          <AgendaDayView appointments={appointments} date={date} timeZone={timeZone} />
        )}
      </main>
    </>
  );
}
