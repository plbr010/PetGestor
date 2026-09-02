"use client";

import { useMemo } from "react";

import type { AppointmentCustomerPackageOption } from "@/features/appointments/types";
import {
  getEligibleCustomerPackagesForBooking,
  getUnassignedPackageHint,
} from "@/features/service-packages/utils";
import { getTodayInTimezone } from "@/lib/timezone";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ButtonLink } from "@/components/ui/button-link";

type AppointmentPackageFieldsProps = {
  customerId: string;
  petId: string;
  serviceId: string;
  companyTimezone: string;
  customerPackages: AppointmentCustomerPackageOption[];
  catalogPackages: Array<{ serviceIds: string[] }>;
  value: string;
  onChange: (value: string) => void;
  currentPackageId?: string | null;
  idPrefix?: string;
};

export function AppointmentPackageFields({
  customerId,
  petId,
  serviceId,
  companyTimezone,
  customerPackages,
  catalogPackages,
  value,
  onChange,
  currentPackageId,
  idPrefix = "",
}: AppointmentPackageFieldsProps) {
  const today = getTodayInTimezone(companyTimezone);
  const fieldId = `${idPrefix}customerPackageId`;

  const eligible = useMemo(() => {
    return getEligibleCustomerPackagesForBooking({
      packages: customerPackages,
      customerId,
      petId,
      serviceId,
      today,
      timeZone: companyTimezone,
    });
  }, [companyTimezone, customerId, customerPackages, petId, serviceId, today]);

  const options = useMemo(() => {
    if (currentPackageId && !eligible.some((pkg) => pkg.id === currentPackageId)) {
      const current = customerPackages.find((pkg) => pkg.id === currentPackageId);
      if (current) {
        const item = current.items.find((entry) => entry.serviceId === serviceId);
        return [
          {
            ...current,
            remaining: item?.remaining ?? 0,
            serviceName: item?.serviceName ?? "Serviço",
          },
          ...eligible,
        ];
      }
    }

    return eligible;
  }, [currentPackageId, customerPackages, eligible, serviceId]);

  const hint = getUnassignedPackageHint({
    customerId,
    petId,
    serviceId,
    eligibleCount: eligible.length,
    packages: customerPackages,
    catalogPackages,
  });

  const selected = options.find((pkg) => pkg.id === value);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Pacote</h2>
        <p className="text-sm text-muted-foreground">
          Opcional. Use uma sessão já vendida a este pet para o serviço escolhido.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId}>Usar sessão de pacote</Label>
        <Select
          id={fieldId}
          name="customerPackageId"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={!customerId || !petId || !serviceId}
        >
          <option value="">Não usar pacote</option>
          {options.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name} · {pkg.remaining} sessão{pkg.remaining === 1 ? "" : "ões"} · válido até{" "}
              {pkg.expiresAt.slice(0, 10).split("-").reverse().join("/")}
            </option>
          ))}
        </Select>
      </div>

      {selected ? (
        <p className="text-sm text-muted-foreground">
          Esta sessão de {selected.serviceName} será descontada do pacote. Cancelar o agendamento
          devolve o saldo; reagendar não consome outra sessão.
        </p>
      ) : null}

      {hint ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p>{hint}</p>
          {petId ? (
            <p className="mt-2">
              <ButtonLink href={`/dashboard/pets/${petId}`} variant="outline" className="h-8 px-3 text-xs">
                Abrir ficha do pet
              </ButtonLink>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
