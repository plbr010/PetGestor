"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";

import {
  createAppointmentAction,
  getAvailableSlotsAction,
  type AppointmentActionState,
} from "@/features/appointments/actions";
import type { AppointmentDetail, AppointmentFormOptions } from "@/features/appointments/types";
import { formatDurationLabel, PET_SIZE_LABELS, PET_SIZES } from "@/features/services/utils";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsToBRL } from "@/lib/money";
import { formatUtcDateInTimezone, formatUtcInTimezone, getTodayInTimezone } from "@/lib/timezone";
import type { PetSize } from "@/types/database.types";

const initialState: AppointmentActionState = {};

type AppointmentFormProps = {
  mode: "create" | "edit";
  options: AppointmentFormOptions;
  appointment?: AppointmentDetail;
  cancelHref: string;
  action?: (
    state: AppointmentActionState,
    formData: FormData,
  ) => Promise<AppointmentActionState>;
};

function getDefaultCustomerId(
  appointment: AppointmentDetail | undefined,
  options: AppointmentFormOptions,
): string {
  if (appointment) {
    return appointment.customer_id;
  }

  return options.customers[0]?.id ?? "";
}

export function AppointmentForm({
  mode,
  options,
  appointment,
  cancelHref,
  action,
}: AppointmentFormProps) {
  const [state, formAction, isPending] = useActionState(action ?? createAppointmentAction, initialState);
  const [isLoadingSlots, startSlotTransition] = useTransition();

  const defaultDate =
    appointment?.scheduled_start
      ? formatUtcDateInTimezone(appointment.scheduled_start, options.companyTimezone)
      : getTodayInTimezone(options.companyTimezone);

  const defaultTime = appointment?.scheduled_start
    ? formatUtcInTimezone(appointment.scheduled_start, options.companyTimezone)
    : "09:00";

  const [customerId, setCustomerId] = useState(() => getDefaultCustomerId(appointment, options));
  const [petId, setPetId] = useState(appointment?.pet_id ?? "");
  const [serviceId, setServiceId] = useState(appointment?.service_id ?? "");
  const [employeeId, setEmployeeId] = useState(appointment?.employee_id ?? "");
  const [petSize, setPetSize] = useState<PetSize | "">(appointment?.pet_size ?? "");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);

  const pets = options.petsByCustomer[customerId] ?? [];
  const selectedService = options.services.find((service) => service.id === serviceId);
  const employees = serviceId ? (options.employeesByService[serviceId] ?? []) : [];

  const preview = useMemo(() => {
    if (!selectedService) {
      return null;
    }

    if (selectedService.pricing_mode === "fixed") {
      return {
        price: selectedService.price_cents ?? 0,
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
      price: sizePrice.price_cents,
      duration: sizePrice.duration_minutes,
    };
  }, [options.sizePricesByService, petSize, selectedService, serviceId]);

  const shouldFetchSlots = Boolean(employeeId && serviceId && date && preview);

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
        excludeAppointmentId: appointment?.id,
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
  }, [
    appointment?.id,
    date,
    employeeId,
    petSize,
    preview,
    serviceId,
    shouldFetchSlots,
    time,
  ]);

  const slotsToShow = shouldFetchSlots ? availableSlots : [];

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Pet</h2>
          <p className="text-sm text-muted-foreground">Selecione o tutor e o pet do atendimento.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customerId">Tutor *</Label>
            <Select
              id="customerId"
              name="customerId"
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setPetId("");
              }}
            >
              <option value="" disabled>
                Selecione um tutor
              </option>
              {options.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="petId">Pet *</Label>
            <Select
              id="petId"
              name="petId"
              value={petId}
              onChange={(event) => setPetId(event.target.value)}
              required
            >
              <option value="" disabled>
                {customerId ? "Selecione um pet" : "Selecione um tutor primeiro"}
              </option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Serviço</h2>
          <p className="text-sm text-muted-foreground">Escolha o serviço e o porte, se necessário.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="serviceId">Serviço *</Label>
          <Select
            id="serviceId"
            name="serviceId"
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value);
              setEmployeeId("");
              setPetSize("");
            }}
            required
          >
            <option value="" disabled>
              Selecione um serviço
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
            <Label htmlFor="petSize">Porte *</Label>
            <Select
              id="petSize"
              name="petSize"
              value={petSize}
              onChange={(event) => setPetSize(event.target.value as PetSize)}
              required
            >
              <option value="" disabled>
                Selecione o porte
              </option>
              {PET_SIZES.map((size) => (
                <option key={size} value={size}>
                  {PET_SIZE_LABELS[size]}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {preview ? (
          <div className="rounded-lg border bg-muted/20 p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Preço (preview): </span>
              <span className="font-medium">{formatCentsToBRL(preview.price)}</span>
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Duração (preview): </span>
              <span className="font-medium">{formatDurationLabel(preview.duration)}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              O valor final será calculado e registrado pelo servidor no momento do agendamento.
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Profissional</h2>
          <p className="text-sm text-muted-foreground">
            Somente profissionais habilitados para o serviço selecionado.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="employeeId">Profissional *</Label>
          <Select
            id="employeeId"
            name="employeeId"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            required
            disabled={!serviceId}
          >
            <option value="" disabled>
              {serviceId ? "Selecione um profissional" : "Selecione um serviço primeiro"}
            </option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Data e horário</h2>
          <p className="text-sm text-muted-foreground">
            Horários sugeridos respeitam a jornada e conflitos existentes.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="date">Data *</Label>
            <Input
              id="date"
              name="date"
              type="date"
              value={date}
              min={getTodayInTimezone(options.companyTimezone)}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="time">Horário *</Label>
            {slotsToShow.length > 0 ? (
              <Select
                id="time"
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
                id="time"
                name="time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
              />
            )}
            {isLoadingSlots ? (
              <p className="text-xs text-muted-foreground">Carregando horários disponíveis…</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={appointment?.notes ?? ""}
          placeholder="Informações adicionais sobre o atendimento"
          rows={4}
        />
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href={cancelHref} variant="outline">
          Cancelar
        </ButtonLink>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : mode === "create" ? "Criar agendamento" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
