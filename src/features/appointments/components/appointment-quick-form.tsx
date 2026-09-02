"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";

import {
  createAppointmentInlineAction,
  getAvailableSlotsAction,
  type AppointmentActionState,
} from "@/features/appointments/actions";
import type { AppointmentFormOptions } from "@/features/appointments/types";
import { AppointmentPackageFields } from "@/features/appointments/components/appointment-package-fields";
import type { AppointmentQuickPrefill } from "@/features/appointments/waitlist/types";
import { PET_SIZE_LABELS, PET_SIZES } from "@/features/services/utils";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsToBRL } from "@/lib/money";
import { getTodayInTimezone } from "@/lib/timezone";
import type { PetSize } from "@/types/database.types";

const initialState: AppointmentActionState = {};

type AppointmentQuickFormProps = {
  options: AppointmentFormOptions;
  initial?: Partial<AppointmentQuickPrefill>;
  waitlistId?: string;
  submitLabel?: string;
  onSuccess?: (appointmentId: string) => void;
  onCancel?: () => void;
};

export function AppointmentQuickForm({
  options,
  initial,
  waitlistId,
  submitLabel = "Salvar agendamento",
  onSuccess,
  onCancel,
}: AppointmentQuickFormProps) {
  const [state, formAction, isPending] = useActionState(createAppointmentInlineAction, initialState);
  const [isLoadingSlots, startSlotTransition] = useTransition();

  const [customerId, setCustomerId] = useState(initial?.customerId ?? options.customers[0]?.id ?? "");
  const [petId, setPetId] = useState(initial?.petId ?? "");
  const [serviceId, setServiceId] = useState(initial?.serviceId ?? "");
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? "");
  const [petSize, setPetSize] = useState<PetSize | "">(
    (initial?.petSize as PetSize | "") ?? "",
  );
  const [date, setDate] = useState(initial?.date ?? getTodayInTimezone(options.companyTimezone));
  const [time, setTime] = useState(initial?.time ?? "09:00");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [customerPackageId, setCustomerPackageId] = useState("");

  const pets = options.petsByCustomer[customerId] ?? [];
  const selectedService = options.services.find((service) => service.id === serviceId);
  const employees = serviceId ? (options.employeesByService[serviceId] ?? []) : [];
  const coveredByPackage = Boolean(customerPackageId);

  const preview = useMemo(() => {
    if (!selectedService) {
      return null;
    }

    if (selectedService.pricing_mode === "fixed") {
      return {
        price: coveredByPackage ? 0 : (selectedService.price_cents ?? 0),
        duration: selectedService.duration_minutes,
      };
    }

    if (!petSize) {
      return null;
    }

    const sizePrice = options.sizePricesByService[serviceId]?.find((row) => row.size === petSize);
    if (!sizePrice) {
      return null;
    }

    return {
      price: coveredByPackage ? 0 : sizePrice.price_cents,
      duration: sizePrice.duration_minutes,
    };
  }, [coveredByPackage, options.sizePricesByService, petSize, selectedService, serviceId]);

  const shouldFetchSlots = Boolean(employeeId && serviceId && date && preview);

  useEffect(() => {
    if (state.appointmentId && state.success) {
      onSuccess?.(state.appointmentId);
    }
  }, [onSuccess, state.appointmentId, state.success]);

  useEffect(() => {
    if (!shouldFetchSlots || !preview) {
      return;
    }

    let cancelled = false;

    startSlotTransition(async () => {
      const result = await getAvailableSlotsAction({
        employeeId,
        serviceId,
        date,
        durationMinutes: preview.duration,
        petSize: petSize || null,
      });

      if (cancelled) {
        return;
      }

      setAvailableSlots(result.slots);

      if (result.slots.length > 0 && !result.slots.includes(time)) {
        setTime(result.slots[0] ?? time);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [date, employeeId, petSize, preview, serviceId, shouldFetchSlots, time]);

  const slotsToShow = shouldFetchSlots ? availableSlots : [];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {waitlistId ? <input type="hidden" name="waitlistId" value={waitlistId} /> : null}
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quick-customerId">Tutor *</Label>
          <Select
            id="quick-customerId"
            name="customerId"
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setPetId("");
              setCustomerPackageId("");
            }}
          >
            <option value="" disabled>
              Selecione
            </option>
            {options.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-petId">Pet *</Label>
          <Select
            id="quick-petId"
            name="petId"
            value={petId}
            onChange={(event) => {
              setPetId(event.target.value);
              setCustomerPackageId("");
            }}
            required
          >
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
        <Label htmlFor="quick-serviceId">Serviço *</Label>
        <Select
          id="quick-serviceId"
          name="serviceId"
          value={serviceId}
          onChange={(event) => {
            setServiceId(event.target.value);
            setEmployeeId("");
            setPetSize("");
            setCustomerPackageId("");
          }}
          required
        >
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

      {selectedService?.pricing_mode === "by_size" ? (
        <div className="space-y-2">
          <Label htmlFor="quick-petSize">Porte *</Label>
          <Select
            id="quick-petSize"
            name="petSize"
            value={petSize}
            onChange={(event) => setPetSize(event.target.value as PetSize)}
            required
          >
            <option value="" disabled>
              Selecione
            </option>
            {PET_SIZES.map((size) => (
              <option key={size} value={size}>
                {PET_SIZE_LABELS[size]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="quick-employeeId">Profissional *</Label>
        <Select
          id="quick-employeeId"
          name="employeeId"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          required
          disabled={!serviceId}
        >
          <option value="" disabled>
            Selecione
          </option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quick-date">Data *</Label>
          <Input
            id="quick-date"
            name="date"
            type="date"
            value={date}
            min={getTodayInTimezone(options.companyTimezone)}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-time">Horário *</Label>
          {slotsToShow.length > 0 ? (
            <Select
              id="quick-time"
              name="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              required
            >
              {slotsToShow.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id="quick-time"
              name="time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              required
            />
          )}
          {isLoadingSlots ? (
            <p className="text-xs text-muted-foreground">Carregando horários…</p>
          ) : null}
        </div>
      </div>

      {preview ? (
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <p>
            <span className="text-muted-foreground">Preço: </span>
            <span className="font-medium">{formatCentsToBRL(preview.price)}</span>
          </p>
          <p className="mt-1">
            <span className="text-muted-foreground">Duração: </span>
            <span className="font-medium">{preview.duration} min</span>
          </p>
          {coveredByPackage ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Coberto pelo pacote — nenhuma cobrança avulsa.
            </p>
          ) : null}
        </div>
      ) : null}

      <AppointmentPackageFields
        customerId={customerId}
        petId={petId}
        serviceId={serviceId}
        companyTimezone={options.companyTimezone}
        customerPackages={options.customerPackages ?? []}
        catalogPackages={options.catalogPackages ?? []}
        value={customerPackageId}
        onChange={setCustomerPackageId}
        idPrefix="quick-"
      />

      <div className="space-y-2">
        <Label htmlFor="quick-notes">Observações</Label>
        <Textarea
          id="quick-notes"
          name="notes"
          defaultValue={initial?.notes ?? ""}
          rows={3}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} className="min-h-11">
            Fechar
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending} className="min-h-11">
          {isPending ? "Salvando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
