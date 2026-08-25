"use client";

import { useActionState, useState } from "react";

import {
  createServiceAction,
  type ServiceActionState,
} from "@/features/services/actions";
import { ServiceRecipeEditor } from "@/features/services/components/service-recipe-editor";
import type { ServiceRecipeItem } from "@/features/services/recipe-types";
import type { ServiceDetail } from "@/features/services/types";
import type { ProductPickerOption } from "@/features/inventory/product-picker";
import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  PET_SIZE_LABELS,
  PET_SIZES,
  PRICING_MODE_LABELS,
} from "@/features/services/utils";
import { formatCentsToInput } from "@/lib/money";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ServicePricingMode } from "@/types/database.types";

const initialState: ServiceActionState = {};

type ServiceFormProps = {
  mode: "create" | "edit";
  service?: ServiceDetail;
  cancelHref: string;
  products: ProductPickerOption[];
  recipes?: ServiceRecipeItem[];
  action?: (
    state: ServiceActionState,
    formData: FormData,
  ) => Promise<ServiceActionState>;
};

function getDefaultSizePrice(service: ServiceDetail | undefined, size: (typeof PET_SIZES)[number]) {
  return service?.sizePrices.find((row) => row.size === size);
}

export function ServiceForm({
  mode,
  service,
  cancelHref,
  products,
  recipes = [],
  action,
}: ServiceFormProps) {
  const [pricingMode, setPricingMode] = useState<ServicePricingMode>(
    service?.pricing_mode ?? "fixed",
  );
  const [state, formAction, isPending] = useActionState(
    action ?? createServiceAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <div className="space-y-2">
        <Label htmlFor="name">Nome *</Label>
        <Input
          id="name"
          name="name"
          defaultValue={service?.name}
          placeholder="Ex.: Banho e tosa"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={service?.description ?? ""}
          placeholder="Detalhes opcionais sobre o serviço"
          rows={3}
        />
      </div>

      <div className="space-y-3">
        <Label>Modelo de preço *</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["fixed", "by_size"] as const).map((modeValue) => (
            <label
              key={modeValue}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                pricingMode === modeValue ? "border-primary bg-primary/5" : "hover:bg-muted/20"
              }`}
            >
              <input
                type="radio"
                name="pricingMode"
                value={modeValue}
                checked={pricingMode === modeValue}
                onChange={() => setPricingMode(modeValue)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">{PRICING_MODE_LABELS[modeValue]}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {modeValue === "fixed"
                    ? "Um único preço e duração para todos os portes."
                    : "Preço e duração diferentes por porte do pet."}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {pricingMode === "fixed" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="price">Preço *</Label>
            <Input
              id="price"
              name="price"
              defaultValue={
                service?.pricing_mode === "fixed" && service.price_cents !== null
                  ? formatCentsToInput(service.price_cents)
                  : ""
              }
              placeholder="89,90"
              inputMode="decimal"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="durationMinutes">Duração (min) *</Label>
            <Input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min={MIN_DURATION_MINUTES}
              max={MAX_DURATION_MINUTES}
              defaultValue={
                service?.pricing_mode === "fixed" ? String(service.duration_minutes) : ""
              }
              placeholder="60"
              required
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Informe preço e duração para cada porte.
          </p>
          <div className="grid gap-4">
            {PET_SIZES.map((size) => {
              const row = getDefaultSizePrice(service, size);

              return (
                <div key={size} className="rounded-xl border p-4">
                  <p className="mb-3 font-medium">{PET_SIZE_LABELS[size]}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`size_${size}_price`}>Preço *</Label>
                      <Input
                        id={`size_${size}_price`}
                        name={`size_${size}_price`}
                        defaultValue={row ? formatCentsToInput(row.price_cents) : ""}
                        placeholder="45,00"
                        inputMode="decimal"
                        required={pricingMode === "by_size"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`size_${size}_duration`}>Duração (min) *</Label>
                      <Input
                        id={`size_${size}_duration`}
                        name={`size_${size}_duration`}
                        type="number"
                        min={MIN_DURATION_MINUTES}
                        max={MAX_DURATION_MINUTES}
                        defaultValue={row ? String(row.duration_minutes) : ""}
                        placeholder="30"
                        required={pricingMode === "by_size"}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id="active"
          name="active"
          type="checkbox"
          defaultChecked={service?.active ?? true}
          value="on"
          className="size-4 rounded border"
        />
        <Label htmlFor="active">Serviço ativo</Label>
      </div>

      <ServiceRecipeEditor products={products} initialRecipes={recipes} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? mode === "create"
              ? "Salvando..."
              : "Atualizando..."
            : mode === "create"
              ? "Cadastrar serviço"
              : "Salvar alterações"}
        </Button>
        <ButtonLink href={cancelHref} variant="outline">
          Cancelar
        </ButtonLink>
      </div>
    </form>
  );
}
