"use client";

import { useActionState, useId, useState } from "react";

import {
  registerStockEntryAction,
  type InventoryActionState,
} from "@/features/inventory/actions";
import { formatQuantity } from "@/features/inventory/stock-engine";
import type { ProductDetail } from "@/features/inventory/types";
import { PRODUCT_UNIT_SHORT_LABELS } from "@/features/inventory/units";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsToInput } from "@/lib/money";

const initialState: InventoryActionState = {};

export function StockEntryForm({
  product,
  suppliers,
}: {
  product: ProductDetail;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, isPending] = useActionState(registerStockEntryAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const formId = useId();
  const unit = PRODUCT_UNIT_SHORT_LABELS[product.unit];

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <p className="text-sm text-muted-foreground">
        Estoque atual:{" "}
        <span className="font-medium text-foreground">
          {formatQuantity(product.currentStock, unit)}
        </span>
      </p>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-quantity`}>Quantidade *</Label>
        <Input
          id={`${formId}-quantity`}
          name="quantity"
          inputMode="decimal"
          placeholder={`Ex.: 10 ${unit}`}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-unitCost`}>Custo unitário *</Label>
        <Input
          id={`${formId}-unitCost`}
          name="unitCost"
          inputMode="decimal"
          defaultValue={formatCentsToInput(product.costPriceCents)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-supplierId`}>Fornecedor</Label>
        <Select id={`${formId}-supplierId`} name="supplierId" defaultValue="">
          <option value="">Sem fornecedor</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-batchCode`}>Lote</Label>
          <Input id={`${formId}-batchCode`} name="batchCode" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-expirationDate`}>Validade</Label>
          <Input id={`${formId}-expirationDate`} name="expirationDate" type="date" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-notes`}>Observação</Label>
        <Textarea id={`${formId}-notes`} name="notes" rows={3} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={isPending}>
          {isPending ? "Registrando..." : "Registrar entrada"}
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
