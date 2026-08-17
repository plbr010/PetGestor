"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createServicePackageAction,
  type ServicePackageActionState,
} from "@/features/service-packages/actions";
import type { ServicePackageDetail } from "@/features/service-packages/types";
import { formatCentsToInput } from "@/lib/money";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ServiceOption = {
  id: string;
  name: string;
};

type PackageItemRow = {
  key: string;
  serviceId: string;
  quantity: number;
};

const initialState: ServicePackageActionState = {};

type ServicePackageFormProps = {
  mode: "create" | "edit";
  pkg?: ServicePackageDetail;
  services: ServiceOption[];
  cancelHref: string;
  action?: (
    state: ServicePackageActionState,
    formData: FormData,
  ) => Promise<ServicePackageActionState>;
};

export function ServicePackageForm({
  mode,
  pkg,
  services,
  cancelHref,
  action,
}: ServicePackageFormProps) {
  const [state, formAction, isPending] = useActionState(
    action ?? createServicePackageAction,
    initialState,
  );

  const initialRows = useMemo<PackageItemRow[]>(() => {
    if (pkg?.items.length) {
      return pkg.items.map((item) => ({
        key: item.id,
        serviceId: item.service_id,
        quantity: item.quantity,
      }));
    }

    return [{ key: "new-1", serviceId: services[0]?.id ?? "", quantity: 1 }];
  }, [pkg, services]);

  const [rows, setRows] = useState(initialRows);

  function addRow() {
    setRows((current) => [
      ...current,
      { key: `new-${current.length + 1}`, serviceId: services[0]?.id ?? "", quantity: 1 },
    ]);
  }

  function removeRow(key: string) {
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== key)));
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <div className="space-y-2">
        <Label htmlFor="name">Nome *</Label>
        <Input id="name" name="name" defaultValue={pkg?.name} placeholder="Ex.: Pacote Banho Mensal" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={pkg?.description ?? ""}
          placeholder="Detalhes opcionais sobre o pacote"
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="price">Preço *</Label>
          <Input
            id="price"
            name="price"
            defaultValue={pkg ? formatCentsToInput(pkg.price_cents) : ""}
            placeholder="160,00"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="validityDays">Validade (dias) *</Label>
          <Input
            id="validityDays"
            name="validityDays"
            type="number"
            min={1}
            max={3650}
            defaultValue={pkg?.validity_days ?? 30}
            required
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border p-3">
        <input
          type="checkbox"
          name="active"
          defaultChecked={pkg?.active ?? true}
          value="on"
          className="mt-1 size-4 rounded border"
        />
        <span>
          <span className="font-medium">Pacote ativo</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Apenas pacotes ativos podem ser vendidos.
          </span>
        </span>
      </label>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-medium">Serviços incluídos *</h3>
            <p className="text-sm text-muted-foreground">
              Informe a quantidade de cada serviço no pacote.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            Adicionar serviço
          </Button>
        </div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
              <div className="space-y-2">
                <Label>Serviço</Label>
                <Select
                  name="itemServiceId"
                  defaultValue={row.serviceId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRows((current) =>
                      current.map((item) =>
                        item.key === row.key ? { ...item, serviceId: value } : item,
                      ),
                    );
                  }}
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Qtd.</Label>
                <Input
                  name="itemQuantity"
                  type="number"
                  min={1}
                  max={999}
                  defaultValue={row.quantity}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length <= 1}
                >
                  Remover
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href={cancelHref} variant="outline">
          Cancelar
        </ButtonLink>
        <Button type="submit" disabled={isPending || services.length === 0}>
          {isPending ? "Salvando…" : mode === "create" ? "Criar pacote" : "Salvar alterações"}
        </Button>
      </div>

      {services.length === 0 ? (
        <p className="text-sm text-destructive">
          Cadastre ao menos um serviço antes de criar um pacote.
        </p>
      ) : null}
    </form>
  );
}
