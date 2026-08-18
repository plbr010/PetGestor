"use client";

import { useActionState, useId, useMemo, useState } from "react";

import {
  registerStockAdjustmentAction,
  type InventoryActionState,
} from "@/features/inventory/actions";
import { formatQuantity, parseNonNegativeQuantityInput, roundQuantity } from "@/features/inventory/stock-engine";
import type { ProductDetail } from "@/features/inventory/types";
import { PRODUCT_UNIT_SHORT_LABELS } from "@/features/inventory/units";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: InventoryActionState = {};

export function StockAdjustmentForm({ product }: { product: ProductDetail }) {
  const [state, formAction, isPending] = useActionState(
    registerStockAdjustmentAction,
    initialState,
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [counted, setCounted] = useState("");
  const formId = useId();
  const unit = PRODUCT_UNIT_SHORT_LABELS[product.unit];
  const countedValue = parseNonNegativeQuantityInput(counted);
  const difference = useMemo(() => {
    if (countedValue == null) {
      return null;
    }

    return roundQuantity(countedValue - product.currentStock);
  }, [countedValue, product.currentStock]);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="rounded-xl border bg-muted/20 p-4 text-sm">
        <p>
          Saldo no sistema:{" "}
          <span className="font-semibold">{formatQuantity(product.currentStock, unit)}</span>
        </p>
        <p className="text-muted-foreground">
          Informe a contagem física. A diferença será registrada como ajuste.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-countedStock`}>Contagem física *</Label>
        <Input
          id={`${formId}-countedStock`}
          name="countedStock"
          inputMode="decimal"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          required
        />
      </div>

      {difference != null ? (
        <p className="text-sm">
          Diferença:{" "}
          <span className="font-medium">
            {difference > 0 ? "+" : ""}
            {formatQuantity(difference, unit)}
          </span>
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${formId}-notes`}>Observação</Label>
        <Textarea id={`${formId}-notes`} name="notes" rows={3} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={isPending}>
          {isPending ? "Registrando..." : "Ajustar estoque"}
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
