"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  cancelAppointmentAction,
  confirmAppointmentAction,
  markNoShowAction,
  type AppointmentActionState,
} from "@/features/appointments/actions";
import { AppointmentStatusBadge } from "@/features/appointments/components/appointment-status-badge";
import { isEditableStatus } from "@/features/appointments/status";
import type { AppointmentListItem } from "@/features/appointments/types";
import { buildDuplicatePrefill } from "@/features/appointments/waitlist/utils";
import {
  formatAppointmentDateLabel,
  formatAppointmentTimeRange,
  formatPriceSnapshot,
} from "@/features/appointments/utils";
import { checkInAppointmentInlineAction } from "@/features/service-orders/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type AppointmentQuickDetailSheetProps = {
  appointment: AppointmentListItem | null;
  date: string;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDuplicate: (prefill: ReturnType<typeof buildDuplicatePrefill>) => void;
  onWaitlistAlert?: (count: number) => void;
};

export function AppointmentQuickDetailSheet({
  appointment,
  date,
  timeZone,
  open,
  onOpenChange,
  onDuplicate,
  onWaitlistAlert,
}: AppointmentQuickDetailSheetProps) {
  const router = useRouter();
  const [cancelState, cancelAction, isCancelling] = useActionState(
    cancelAppointmentAction.bind(null, appointment?.id ?? ""),
    {} as AppointmentActionState,
  );
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isConfirming, startConfirm] = useTransition();
  const [isMarkingNoShow, startNoShow] = useTransition();
  const [isCheckingIn, startCheckIn] = useTransition();

  useEffect(() => {
    if (cancelState.success) {
      router.refresh();
    }
  }, [cancelState.success, router]);

  if (!appointment) {
    return null;
  }

  const editable = isEditableStatus(appointment.status);
  const canCheckIn =
    appointment.status === "scheduled" ||
    appointment.status === "confirmed" ||
    appointment.status === "in_progress";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto sm:max-w-lg sm:mx-auto">
        <SheetHeader>
          <SheetTitle>{appointment.pet.name}</SheetTitle>
          <SheetDescription>
            {formatAppointmentDateLabel(date, timeZone)} ·{" "}
            {formatAppointmentTimeRange(
              appointment.scheduled_start,
              appointment.scheduled_end,
              timeZone,
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <div className="flex items-center justify-between gap-2">
            <AppointmentStatusBadge status={appointment.status} />
            <span className="font-medium">{formatPriceSnapshot(appointment.price_cents_snapshot)}</span>
          </div>

          <dl className="grid gap-2 text-sm">
            <Row label="Tutor" value={appointment.customer.name} />
            <Row label="Serviço" value={appointment.service_name_snapshot} />
            <Row label="Profissional" value={appointment.employee.name} />
          </dl>

          {appointment.notes ? (
            <p className="rounded-lg bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {appointment.notes}
            </p>
          ) : null}

          {message ? <FormFeedback message={message} variant="success" /> : null}
          {error ? <FormFeedback message={error} variant="error" /> : null}
          {cancelState.success ? <FormFeedback message={cancelState.success} variant="success" /> : null}
          {cancelState.error ? <FormFeedback message={cancelState.error} variant="error" /> : null}
          {cancelState.waitlistMatches && cancelState.waitlistMatches > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p>
                Existem {cancelState.waitlistMatches} cliente(s) na lista de espera que podem se
                encaixar neste horário.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-2 min-h-10 w-full"
                onClick={() => {
                  onWaitlistAlert?.(cancelState.waitlistMatches ?? 0);
                  onOpenChange(false);
                }}
              >
                Ver lista de espera
              </Button>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <ButtonLink
              href={`/dashboard/agenda/${appointment.id}/editar`}
              variant="outline"
              className="min-h-11"
            >
              Editar
            </ButtonLink>
            <ButtonLink
              href={`/dashboard/agenda/${appointment.id}`}
              variant="outline"
              className="min-h-11"
            >
              Ver detalhes
            </ButtonLink>
          </div>

          {editable ? (
            <div className="flex flex-wrap gap-2">
              {appointment.status === "scheduled" ? (
                <Button
                  type="button"
                  className="min-h-11 flex-1"
                  disabled={isConfirming}
                  onClick={() => {
                    startConfirm(async () => {
                      const result = await confirmAppointmentAction(appointment.id);
                      if (result.success) {
                        setMessage(result.success);
                        setError(undefined);
                        router.refresh();
                      } else if (result.error) {
                        setError(result.error);
                      }
                    });
                  }}
                >
                  {isConfirming ? "Confirmando…" : "Confirmar"}
                </Button>
              ) : null}

              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1"
                disabled={isMarkingNoShow}
                onClick={() => {
                  startNoShow(async () => {
                    const result = await markNoShowAction(appointment.id);
                    if (result.success) {
                      setMessage(result.success);
                      router.refresh();
                    } else if (result.error) {
                      setError(result.error);
                    }
                  });
                }}
              >
                {isMarkingNoShow ? "Salvando…" : "Marcar falta"}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1"
                onClick={() => {
                  onDuplicate(
                    buildDuplicatePrefill({
                      customerId: appointment.customer_id,
                      petId: appointment.pet_id,
                      serviceId: appointment.service_id,
                      employeeId: appointment.employee_id,
                      petSize: appointment.pet_size,
                      notes: appointment.notes,
                    }),
                  );
                  onOpenChange(false);
                }}
              >
                Duplicar
              </Button>
            </div>
          ) : null}

          {canCheckIn ? (
            <Button
              type="button"
              className="min-h-11 w-full"
              disabled={isCheckingIn}
              onClick={() => {
                startCheckIn(async () => {
                  const result = await checkInAppointmentInlineAction(appointment.id);
                  if (result.serviceOrderId) {
                    router.push(`/dashboard/atendimentos/${result.serviceOrderId}`);
                  } else if (result.error) {
                    setError(result.error);
                  }
                });
              }}
            >
              {isCheckingIn ? "Registrando…" : "Fazer check-in"}
            </Button>
          ) : null}

          {editable ? (
            <form action={cancelAction} className="space-y-3 rounded-xl border p-4">
              <div>
                <h3 className="font-medium">Cancelar agendamento</h3>
                <p className="text-sm text-muted-foreground">
                  O horário será liberado na agenda.
                </p>
              </div>
              <input type="hidden" name="seriesScope" value="this" />
              <div className="space-y-2">
                <Label htmlFor="quick-cancel-reason">Motivo (opcional)</Label>
                <Input id="quick-cancel-reason" name="cancellationReason" />
              </div>
              <Button type="submit" variant="destructive" disabled={isCancelling} className="min-h-11 w-full">
                {isCancelling ? "Cancelando…" : "Cancelar agendamento"}
              </Button>
            </form>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}
