import { AgendaFilters } from "@/features/appointments/components/agenda-filters";
import { AgendaInteractiveShell } from "@/features/appointments/components/agenda-interactive-shell";
import { AgendaNav } from "@/features/appointments/components/agenda-nav";
import {
  getAppointmentFormOptions,
  getAppointmentsForDay,
  getAppointmentsForWeek,
  getSchedulableEmployeesForFilter,
} from "@/features/appointments/queries";
import { getActiveWaitlist } from "@/features/appointments/waitlist/queries";
import { getTimeBlocksForDay } from "@/features/appointments/time-blocks/queries";
import { parseAppointmentStatusFilter } from "@/features/appointments/status";
import { getWeekRange, parseAgendaDate, parseAgendaView } from "@/features/appointments/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { isValidUuid } from "@/lib/security/uuid";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AgendaPageProps = {
  searchParams: Promise<{
    date?: string;
    view?: string;
    employee?: string;
    status?: string;
    lista?: string;
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
  const companyId = context.membership.company.id;

  const [appointments, employees, formOptions, waitlist, timeBlocks] = await Promise.all([
    view === "week"
      ? getAppointmentsForWeek(companyId, weekRange.start, timeZone, filters)
      : getAppointmentsForDay(companyId, date, timeZone, filters),
    getSchedulableEmployeesForFilter(companyId),
    getAppointmentFormOptions(companyId, timeZone),
    getActiveWaitlist(companyId),
    view === "day" ? getTimeBlocksForDay(companyId, date, timeZone, employeeId) : Promise.resolve([]),
  ]);

  return (
    <>
      <DashboardHeader
        title="Agenda"
        description="Organize os atendimentos e horários do seu pet shop."
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <AgendaNav
          date={date}
          view={view}
          timeZone={timeZone}
          employeeId={employeeId}
          status={status}
        />

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

        <AgendaInteractiveShell
          view={view}
          date={date}
          timeZone={timeZone}
          appointments={appointments}
          weekDates={weekRange.dates}
          timeBlocks={timeBlocks}
          waitlist={waitlist}
          formOptions={formOptions}
          employees={employees}
          highlightWaitlist={query.lista === "1"}
        />
      </main>
    </>
  );
}
