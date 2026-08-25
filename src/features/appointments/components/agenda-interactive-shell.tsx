"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AgendaDayView } from "@/features/appointments/components/agenda-day-view";
import { AgendaWeekView } from "@/features/appointments/components/agenda-week-view";
import { AppointmentQuickDetailSheet } from "@/features/appointments/components/appointment-quick-detail-sheet";
import { AppointmentQuickForm } from "@/features/appointments/components/appointment-quick-form";
import { TimeBlockFormSheet } from "@/features/appointments/components/time-block-form-sheet";
import { WaitlistFormSheet } from "@/features/appointments/components/waitlist-form-sheet";
import { WaitlistPanel } from "@/features/appointments/components/waitlist-panel";
import type { AppointmentFormOptions, AppointmentListItem } from "@/features/appointments/types";
import type { ScheduleTimeBlock } from "@/features/appointments/time-blocks/types";
import type {
  AppointmentQuickPrefill,
  WaitlistListItem,
} from "@/features/appointments/waitlist/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type AgendaInteractiveShellProps = {
  view: "day" | "week";
  date: string;
  timeZone: string;
  appointments: AppointmentListItem[];
  weekDates: string[];
  timeBlocks: ScheduleTimeBlock[];
  waitlist: WaitlistListItem[];
  formOptions: AppointmentFormOptions;
  employees: Array<{ id: string; name: string }>;
  highlightWaitlist?: boolean;
};

export function AgendaInteractiveShell({
  view,
  date,
  timeZone,
  appointments,
  weekDates,
  timeBlocks,
  waitlist,
  formOptions,
  employees,
  highlightWaitlist = false,
}: AgendaInteractiveShellProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentListItem | null>(null);
  const [createPrefill, setCreatePrefill] = useState<Partial<AppointmentQuickPrefill>>({ date });
  const [waitlistId, setWaitlistId] = useState<string | undefined>();
  const [waitlistHighlight, setWaitlistHighlight] = useState(highlightWaitlist);

  const defaultCreatePrefill = useMemo(
    () => ({ ...createPrefill, date: createPrefill.date ?? date }),
    [createPrefill, date],
  );

  function openCreateSheet(prefill: Partial<AppointmentQuickPrefill>, fromWaitlistId?: string) {
    setCreatePrefill({ date, ...prefill });
    setWaitlistId(fromWaitlistId);
    setCreateOpen(true);
  }

  function handleCreateSuccess() {
    setCreateOpen(false);
    setWaitlistId(undefined);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          className="min-h-11"
          data-tour-id="cta-new-appointment"
          onClick={() => openCreateSheet({ time: "09:00" })}
        >
          Agendamento rápido
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setWaitlistOpen(true)}
        >
          Adicionar à lista de espera
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setBlockOpen(true)}
        >
          Bloquear horário
        </Button>
      </div>

      {view === "week" ? (
        <AgendaWeekView appointments={appointments} weekDates={weekDates} timeZone={timeZone} />
      ) : (
        <AgendaDayView
          appointments={appointments}
          timeBlocks={timeBlocks}
          date={date}
          timeZone={timeZone}
          onSlotClick={(time) => openCreateSheet({ time })}
          onAppointmentClick={(appointment) => {
            setSelectedAppointment(appointment);
            setDetailOpen(true);
          }}
        />
      )}

      <WaitlistPanel
        entries={waitlist}
        highlighted={waitlistHighlight}
        onConvert={(entry) => {
          openCreateSheet(
            {
              customerId: entry.customer_id,
              petId: entry.pet_id,
              serviceId: entry.service_id,
              employeeId: entry.preferred_employee_id ?? undefined,
              notes: entry.notes,
            },
            entry.id,
          );
        }}
        onRefresh={() => router.refresh()}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto sm:max-w-lg sm:mx-auto">
          <SheetHeader>
            <SheetTitle>Novo agendamento</SheetTitle>
            <SheetDescription>Preencha os dados e salve sem sair da agenda.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <AppointmentQuickForm
              options={formOptions}
              initial={defaultCreatePrefill}
              waitlistId={waitlistId}
              onSuccess={handleCreateSuccess}
              onCancel={() => setCreateOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <AppointmentQuickDetailSheet
        appointment={selectedAppointment}
        date={date}
        timeZone={timeZone}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDuplicate={(prefill) => openCreateSheet({ ...prefill, time: "09:00" })}
        onWaitlistAlert={() => {
          setWaitlistHighlight(true);
          setDetailOpen(false);
        }}
      />

      <WaitlistFormSheet
        open={waitlistOpen}
        onOpenChange={setWaitlistOpen}
        options={formOptions}
        defaultDate={date}
        onSuccess={() => {
          setWaitlistOpen(false);
          router.refresh();
        }}
      />

      <TimeBlockFormSheet
        open={blockOpen}
        onOpenChange={setBlockOpen}
        defaultDate={date}
        employees={employees}
        onSuccess={() => {
          setBlockOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
