"use client";

import { useMemo, useState } from "react";

import type { ProductPickerOption } from "@/features/inventory/product-picker";
import { formatQuantity } from "@/features/inventory/stock-engine";
import { PRODUCT_UNIT_SHORT_LABELS } from "@/features/inventory/units";
import { parseQuantityInput } from "@/features/inventory/stock-engine";
import type { ServiceRecipeItem } from "@/features/services/recipe-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type DraftLine = {
  key: string;
  productId: string;
  quantity: string;
};

type ServiceRecipeEditorProps = {
  products: ProductPickerOption[];
  initialRecipes?: ServiceRecipeItem[];
};

export function ServiceRecipeEditor({ products, initialRecipes = [] }: ServiceRecipeEditorProps) {
  const [lines, setLines] = useState<DraftLine[]>(() =>
    initialRecipes.map((recipe) => ({
      key: recipe.id,
      productId: recipe.productId,
      quantity: String(recipe.quantity).replace(".", ","),
    })),
  );

  const payload = useMemo(() => {
    return lines
      .map((line) => {
        const quantity = parseQuantityInput(line.quantity);
        if (!line.productId || quantity == null) {
          return null;
        }
        return { product_id: line.productId, quantity };
      })
      .filter((item): item is { product_id: string; quantity: number } => item != null);
  }, [lines]);

  const usedProductIds = new Set(lines.map((line) => line.productId).filter(Boolean));

  function addLine() {
    setLines((current) => [
      ...current,
      { key: crypto.randomUUID(), productId: "", quantity: "" },
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div>
        <h3 className="font-medium">Produtos e insumos utilizados</h3>
        <p className="text-sm text-muted-foreground">
          Quantidade padrão na unidade do produto (ex.: 20 ml). Não entra na cobrança do cliente.
          Sem conversão automática entre unidades (ml ↔ litro).
        </p>
      </div>

      <input type="hidden" name="recipes_json" value={JSON.stringify(payload)} />

      <ul className="space-y-3">
        {lines.map((line) => {
          const product = products.find((item) => item.id === line.productId);
          const unitLabel = product
            ? PRODUCT_UNIT_SHORT_LABELS[product.unit]
            : "";

          return (
            <li key={line.key} className="space-y-2 rounded-lg border p-3">
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select
                  value={line.productId}
                  onChange={(event) => updateLine(line.key, { productId: event.target.value })}
                  className="min-h-11"
                  required={Boolean(line.quantity.trim())}
                >
                  <option value="">Selecione</option>
                  {products.map((option) => (
                    <option
                      key={option.id}
                      value={option.id}
                      disabled={usedProductIds.has(option.id) && option.id !== line.productId}
                    >
                      {option.name} ({PRODUCT_UNIT_SHORT_LABELS[option.unit]})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label>Quantidade padrão</Label>
                  <Input
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    inputMode="decimal"
                    placeholder="20"
                    className="min-h-11"
                    required={Boolean(line.productId)}
                  />
                </div>
                <span className="pb-3 text-sm text-muted-foreground">{unitLabel || "un"}</span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0"
                  onClick={() => removeLine(line.key)}
                >
                  Remover
                </Button>
              </div>
              {product ? (
                <p className="text-xs text-muted-foreground">
                  Estoque atual: {formatQuantity(product.currentStock, unitLabel)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={addLine}>
        + Adicionar produto
      </Button>
    </div>
  );
}
