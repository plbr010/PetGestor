"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  createEmployeeAction,
  type EmployeeActionState,
} from "@/features/employees/actions";
import type { EmployeeDetail } from "@/features/employees/types";
import {
  formatTimeDisplay,
  getDefaultWorkingHours,
  WEEKDAYS,
} from "@/features/employees/utils";
import type { ServiceListItem } from "@/features/services/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPhoneDisplay, formatPhoneInput } from "@/lib/phone";

const initialState: EmployeeActionState = {};

type EmployeeFormProps = {
  mode: "create" | "edit";
  employee?: EmployeeDetail;
  availableServices: ServiceListItem[];
  cancelHref: string;
  action?: (
    state: EmployeeActionState,
    formData: FormData,
  ) => Promise<EmployeeActionState>;
};

function getWorkingHourDefaults(employee?: EmployeeDetail) {
  if (!employee || employee.workingHours.length === 0) {
    return getDefaultWorkingHours();
  }

  return WEEKDAYS.map((day) => {
    const row = employee.workingHours.find((hour) => hour.weekday === day.weekday);

    if (!row) {
      return { weekday: day.weekday, enabled: false, startTime: null, endTime: null };
    }

    return {
      weekday: day.weekday,
      enabled: row.enabled,
      startTime: row.start_time ? formatTimeDisplay(row.start_time) : null,
      endTime: row.end_time ? formatTimeDisplay(row.end_time) : null,
    };
  });
}

export function EmployeeForm({
  mode,
  employee,
  availableServices,
  cancelHref,
  action,
}: EmployeeFormProps) {
  const [state, formAction, isPending] = useActionState(
    action ?? createEmployeeAction,
    initialState,
  );

  const workingHourDefaults = getWorkingHourDefaults(employee);
  const selectedServiceIds = new Set(employee?.services.map((service) => service.serviceId) ?? []);

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Dados do funcionário</h2>
          <p className="text-sm text-muted-foreground">Informações básicas de contato e cargo.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Nome *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={employee?.name}
            placeholder="Ex.: João Silva"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="jobTitle">Cargo</Label>
            <Input
              id="jobTitle"
              name="jobTitle"
              defaultValue={employee?.job_title ?? ""}
              placeholder="Ex.: Tosador"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={employee?.phone ? formatPhoneDisplay(employee.phone) : ""}
              placeholder="(32) 99999-9999"
              inputMode="tel"
              onChange={(event) => {
                event.currentTarget.value = formatPhoneInput(event.currentTarget.value);
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={employee?.email ?? ""}
            placeholder="funcionario@email.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Observações</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={employee?.notes ?? ""}
            placeholder="Informações adicionais"
            rows={3}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Agenda</h2>
          <p className="text-sm text-muted-foreground">
            Define se este profissional poderá receber agendamentos futuramente.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <input
              id="canBeScheduled"
              name="canBeScheduled"
              type="checkbox"
              defaultChecked={employee?.can_be_scheduled ?? true}
              value="on"
              className="size-4 rounded border"
            />
            <span>Pode receber agendamentos</span>
          </label>

          {mode === "edit" ? (
            <label className="flex items-center gap-2">
              <input
                id="active"
                name="active"
                type="checkbox"
                defaultChecked={employee?.active ?? true}
                value="on"
                className="size-4 rounded border"
              />
              <span>Funcionário ativo</span>
            </label>
          ) : (
            <input type="hidden" name="active" value="on" />
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Serviços executados</h2>
          <p className="text-sm text-muted-foreground">
            Selecione os serviços que este profissional realiza.
          </p>
        </div>

        {availableServices.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Nenhum serviço ativo cadastrado.{" "}
            <Link href="/dashboard/servicos/novo" className="font-medium text-primary underline-offset-4 hover:underline">
              Cadastrar serviço
            </Link>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {availableServices.map((service) => (
              <label
                key={service.id}
                className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/20"
              >
                <input
                  type="checkbox"
                  name="serviceIds"
                  value={service.id}
                  defaultChecked={selectedServiceIds.has(service.id)}
                  className="size-4 rounded border"
                />
                <span>{service.name}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Horários de trabalho</h2>
          <p className="text-sm text-muted-foreground">
            Um intervalo por dia. MVP — futuramente poderá evoluir para múltiplos turnos.
          </p>
        </div>

        <div className="space-y-3">
          {WEEKDAYS.map((day) => {
            const defaults = workingHourDefaults.find((hour) => hour.weekday === day.weekday);

            return (
              <div key={day.weekday} className="rounded-xl border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      name={`weekday_${day.weekday}_enabled`}
                      defaultChecked={defaults?.enabled ?? false}
                      value="on"
                      className="size-4 rounded border"
                    />
                    {day.label}
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`weekday_${day.weekday}_start`}>Início</Label>
                      <Input
                        id={`weekday_${day.weekday}_start`}
                        name={`weekday_${day.weekday}_start`}
                        type="time"
                        defaultValue={defaults?.startTime ?? ""}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`weekday_${day.weekday}_end`}>Fim</Label>
                      <Input
                        id={`weekday_${day.weekday}_end`}
                        name={`weekday_${day.weekday}_end`}
                        type="time"
                        defaultValue={defaults?.endTime ?? ""}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? mode === "create"
              ? "Salvando..."
              : "Atualizando..."
            : mode === "create"
              ? "Cadastrar funcionário"
              : "Salvar alterações"}
        </Button>
        <ButtonLink href={cancelHref} variant="outline">
          Cancelar
        </ButtonLink>
      </div>
    </form>
  );
}
