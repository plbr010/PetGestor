"use client";

import { useActionState, useMemo, useState, useTransition } from "react";

import type { ProductPickerOption } from "@/features/inventory/product-picker";
import { formatQuantity, parseQuantityInput } from "@/features/inventory/stock-engine";
import { PRODUCT_UNIT_SHORT_LABELS } from "@/features/inventory/units";
import {
  removeServiceOrderConsumptionAction,
  upsertServiceOrderConsumptionAction,
  type ServiceOrderActionState,
} from "@/features/service-orders/actions";
import {
  computeConsumptionCostCents,
  sumConsumptionCostCents,
  type ServiceOrderConsumptionItem,
} from "@/features/services/recipe-types";
import { formatCentsToBRL } from "@/lib/money";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ServiceOrderStatus } from "@/types/database.types";

type ServiceOrderConsumptionsPanelProps = {
  serviceOrderId: string;
  status: ServiceOrderStatus;
  consumptions: ServiceOrderConsumptionItem[];
  products: ProductPickerOption[];
  canEdit: boolean;
  showCost: boolean;
};

export function ServiceOrderConsumptionsPanel({
  serviceOrderId,
  status,
  consumptions,
  products,
  canEdit,
  showCost,
}: ServiceOrderConsumptionsPanelProps) {
  const editable = canEdit && (status === "waiting" || status === "in_progress");
  const totalCost = sumConsumptionCostCents(consumptions);
  const [addError, setAddError] = useState<string | undefined>();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [isAdding, startAdd] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const usedIds = useMemo(
    () => new Set(consumptions.map((item) => item.productId)),
    [consumptions],
  );

  async function handleAdd() {
    setAddError(undefined);
    const qty = parseQuantityInput(quantity);
    if (!productId || qty == null) {
      setAddError("Selecione o produto e informe a quantidade.");
      return;
    }

    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("quantity", quantity);
    formData.set("source", "manual");

    const result = await upsertServiceOrderConsumptionAction(serviceOrderId, {}, formData);
    if (result.error) {
      setAddError(result.error);
      return;
    }
    setProductId("");
    setQuantity("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Produtos utilizados</h3>
        <p className="text-sm text-muted-foreground">
          Insumos do atendimento (não cobrados ao cliente). A baixa no estoque ocorre ao marcar
          como pronto.
        </p>
      </div>

      {consumptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum produto vinculado a este atendimento.</p>
      ) : (
        <ul className="space-y-3">
          {consumptions.map((item) => (
            <ConsumptionRow
              key={item.id}
              item={item}
              serviceOrderId={serviceOrderId}
              editable={editable}
              showCost={showCost}
              removingId={removingId}
              setRemovingId={setRemovingId}
            />
          ))}
        </ul>
      )}

      {showCost && totalCost != null ? (
        <p className="text-sm font-medium">
          Total de insumos: {formatCentsToBRL(totalCost)}
        </p>
      ) : null}

      {editable ? (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-medium">+ Adicionar produto utilizado</p>
          {addError ? <FormFeedback message={addError} variant="error" /> : null}
          <div className="space-y-2">
            <Label htmlFor="extra-product">Produto</Label>
            <Select
              id="extra-product"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="min-h-11"
            >
              <option value="">Selecione</option>
              {products.map((product) => (
                <option key={product.id} value={product.id} disabled={usedIds.has(product.id)}>
                  {product.name} ({PRODUCT_UNIT_SHORT_LABELS[product.unit]})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="extra-qty">Quantidade</Label>
              <Input
                id="extra-qty"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                className="min-h-11"
                placeholder="10"
              />
            </div>
            <Button
              type="button"
              className="min-h-11 shrink-0"
              disabled={isAdding}
              onClick={() => startAdd(() => handleAdd())}
            >
              {isAdding ? "Adicionando…" : "Adicionar"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConsumptionRow({
  item,
  serviceOrderId,
  editable,
  showCost,
  removingId,
  setRemovingId,
}: {
  item: ServiceOrderConsumptionItem;
  serviceOrderId: string;
  editable: boolean;
  showCost: boolean;
  removingId: string | null;
  setRemovingId: (id: string | null) => void;
}) {
  const [qty, setQty] = useState(String(item.quantity).replace(".", ","));
  const [state, formAction, isPending] = useActionState(
    upsertServiceOrderConsumptionAction.bind(null, serviceOrderId),
    {} as ServiceOrderActionState,
  );
  const [isRemoving, startRemove] = useTransition();
  const unit = PRODUCT_UNIT_SHORT_LABELS[item.unit];
  const cost = computeConsumptionCostCents(item);

  return (
    <li className="space-y-2 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{item.productName}</p>
          <p className="text-xs text-muted-foreground">
            {item.source === "recipe" ? "Da receita do serviço" : "Adicionado no atendimento"}
            {item.consumedAt ? " · baixado do estoque" : ""}
          </p>
        </div>
        {showCost && cost != null ? (
          <p className="text-sm text-muted-foreground">{formatCentsToBRL(cost)}</p>
        ) : null}
      </div>

      {editable ? (
        <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="productId" value={item.productId} />
          <input type="hidden" name="source" value={item.source} />
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`qty-${item.id}`}>Quantidade real</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`qty-${item.id}`}
                name="quantity"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                inputMode="decimal"
                className="min-h-11"
              />
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" className="min-h-11" disabled={isPending}>
              {isPending ? "Salvando…" : "Salvar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={isRemoving || removingId === item.id}
              onClick={() => {
                setRemovingId(item.id);
                startRemove(async () => {
                  await removeServiceOrderConsumptionAction(item.id, serviceOrderId);
                  setRemovingId(null);
                });
              }}
            >
              Remover
            </Button>
          </div>
          {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
          {state.success ? <FormFeedback message={state.success} variant="success" /> : null}
        </form>
      ) : (
        <p className="text-sm">
          {formatQuantity(item.quantity, unit)}
        </p>
      )}
    </li>
  );
}
