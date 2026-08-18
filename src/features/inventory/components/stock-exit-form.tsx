"use client";

import { useActionState, useId, useState } from "react";

import {
  registerStockExitAction,
  type InventoryActionState,
} from "@/features/inventory/actions";
import { formatQuantity } from "@/features/inventory/stock-engine";
import type { ProductDetail } from "@/features/inventory/types";
import {
  PRODUCT_UNIT_SHORT_LABELS,
  STOCK_EXIT_REASON_LABELS,
  STOCK_EXIT_REASONS,
} from "@/features/inventory/units";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const initialState: InventoryActionState = {};

export function StockExitForm({ product }: { product: ProductDetail }) {
  const [state, formAction, isPending] = useActionState(registerStockExitAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState<(typeof STOCK_EXIT_REASONS)[number]>("internal_use");
  const formId = useId();
  const unit = PRODUCT_UNIT_SHORT_LABELS[product.unit];
  const notesRequired = reason === "other" || reason === "adjustment";

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="rounded-xl border bg-muted/20 p-4 text-sm">
        <p>
          Estoque atual:{" "}
          <span className="font-semibold">{formatQuantity(product.currentStock, unit)}</span>
        </p>
        <p className="text-muted-foreground">
          Disponível (sem vencidos): {formatQuantity(product.availableStock, unit)}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-quantity`}>Quantidade *</Label>
        <Input
          id={`${formId}-quantity`}
          name="quantity"
          inputMode="decimal"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-reason`}>Motivo *</Label>
        <Select
          id={`${formId}-reason`}
          name="reason"
          value={reason}
          onChange={(event) =>
            setReason(event.target.value as (typeof STOCK_EXIT_REASONS)[number])
          }
        >
          {STOCK_EXIT_REASONS.map((value) => (
            <option key={value} value={value}>
              {STOCK_EXIT_REASON_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-notes`}>
          Observação {notesRequired ? "*" : ""}
        </Label>
        <Textarea id={`${formId}-notes`} name="notes" rows={3} required={notesRequired} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={isPending}>
          {isPending ? "Registrando..." : "Registrar saída"}
        </Button>
        <ButtonLink
          href={`/dashboard/estoque/${product.id}`}
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
        >
          Cancelar
        </ButtonLink>
      </div>
    </form>
  );
}
