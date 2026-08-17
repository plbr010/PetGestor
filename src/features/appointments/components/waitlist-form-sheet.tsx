"use client";

import { useActionState, useEffect, useState } from "react";

import {
  addWaitlistEntryAction,
  type WaitlistActionState,
} from "@/features/appointments/waitlist/actions";
import { WAITLIST_PERIOD_LABELS } from "@/features/appointments/waitlist/utils";
import { WAITLIST_PERIODS } from "@/features/appointments/waitlist/types";
import type { AppointmentFormOptions } from "@/features/appointments/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const initialState: WaitlistActionState = {};

type WaitlistFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: AppointmentFormOptions;
  defaultDate?: string;
  onSuccess?: () => void;
};

export function WaitlistFormSheet({
  open,
  onOpenChange,
  options,
  defaultDate,
  onSuccess,
}: WaitlistFormSheetProps) {
  const [state, formAction, isPending] = useActionState(addWaitlistEntryAction, initialState);
  const [customerId, setCustomerId] = useState(options.customers[0]?.id ?? "");
  const pets = options.petsByCustomer[customerId] ?? [];
  const allEmployees = Object.values(options.employeesByService).flat();
  const uniqueEmployees = Array.from(new Map(allEmployees.map((e) => [e.id, e])).values());

  useEffect(() => {
    if (state.success) {
      onSuccess?.();
    }
  }, [onSuccess, state.success]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto sm:max-w-lg sm:mx-auto">
        <SheetHeader>
          <SheetTitle>Adicionar à lista de espera</SheetTitle>
          <SheetDescription>
            Registre interesse quando o horário desejado não estiver disponível.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="space-y-4 px-4 pb-6">
          {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
          {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="waitlist-customerId">Tutor *</Label>
              <Select
                id="waitlist-customerId"
                name="customerId"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                {options.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="waitlist-petId">Pet *</Label>
              <Select id="waitlist-petId" name="petId" defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="waitlist-serviceId">Serviço *</Label>
            <Select id="waitlist-serviceId" name="serviceId" defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              {options.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="waitlist-preferredEmployeeId">Profissional preferencial</Label>
            <Select id="waitlist-preferredEmployeeId" name="preferredEmployeeId" defaultValue="">
              <option value="">Qualquer</option>
              {uniqueEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="waitlist-preferredDate">Data desejada</Label>
              <Input
                id="waitlist-preferredDate"
                name="preferredDate"
                type="date"
                defaultValue={defaultDate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="waitlist-preferredPeriod">Período</Label>
              <Select id="waitlist-preferredPeriod" name="preferredPeriod" defaultValue="any">
                {WAITLIST_PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {WAITLIST_PERIOD_LABELS[period]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="waitlist-preferredTimeStart">Horário inicial</Label>
              <Input id="waitlist-preferredTimeStart" name="preferredTimeStart" type="time" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="waitlist-preferredTimeEnd">Horário final</Label>
              <Input id="waitlist-preferredTimeEnd" name="preferredTimeEnd" type="time" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="waitlist-notes">Observação</Label>
            <Textarea id="waitlist-notes" name="notes" rows={3} />
          </div>

          <Button type="submit" disabled={isPending} className="min-h-11 w-full">
            {isPending ? "Salvando…" : "Adicionar à lista de espera"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
