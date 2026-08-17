"use client";

import { useActionState, useEffect } from "react";

import {
  createTimeBlockAction,
  type TimeBlockActionState,
} from "@/features/appointments/time-blocks/actions";
import { TIME_BLOCK_REASONS } from "@/features/appointments/time-blocks/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const initialState: TimeBlockActionState = {};

type TimeBlockFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  defaultStartTime?: string;
  employees: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
};

export function TimeBlockFormSheet({
  open,
  onOpenChange,
  defaultDate,
  defaultStartTime,
  employees,
  onSuccess,
}: TimeBlockFormSheetProps) {
  const [state, formAction, isPending] = useActionState(createTimeBlockAction, initialState);

  useEffect(() => {
    if (state.success) {
      onSuccess?.();
    }
  }, [onSuccess, state.success]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto sm:max-w-lg sm:mx-auto">
        <SheetHeader>
          <SheetTitle>Bloquear horário</SheetTitle>
          <SheetDescription>
            Impede novos agendamentos no período (almoço, reunião, folga…).
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="space-y-4 px-4 pb-6">
          {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
          {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

          <div className="space-y-2">
            <Label htmlFor="block-date">Data *</Label>
            <Input id="block-date" name="date" type="date" defaultValue={defaultDate} required />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="block-startTime">Início *</Label>
              <Input
                id="block-startTime"
                name="startTime"
                type="time"
                defaultValue={defaultStartTime ?? "12:00"}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-endTime">Fim *</Label>
              <Input id="block-endTime" name="endTime" type="time" defaultValue="13:00" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="block-employeeId">Profissional</Label>
            <Select id="block-employeeId" name="employeeId" defaultValue="">
              <option value="">Todos (empresa)</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="block-reason">Motivo *</Label>
            <Select id="block-reason" name="reason" defaultValue={TIME_BLOCK_REASONS[0]} required>
              {TIME_BLOCK_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
              <option value="custom">Outro…</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="block-customReason">Motivo personalizado</Label>
            <Input id="block-customReason" name="customReason" placeholder="Descreva o bloqueio" />
          </div>

          <Button type="submit" disabled={isPending} className="min-h-11 w-full">
            {isPending ? "Salvando…" : "Bloquear horário"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
