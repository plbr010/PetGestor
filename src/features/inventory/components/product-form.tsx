"use client";

import { useActionState } from "react";

import {
  createProductAction,
  updateProductAction,
  type InventoryActionState,
} from "@/features/inventory/actions";
import type { ProductCategoryItem, ProductDetail } from "@/features/inventory/types";
import { PRODUCT_UNITS, PRODUCT_UNIT_LABELS } from "@/features/inventory/units";
import { formatQuantity } from "@/features/inventory/stock-engine";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsToInput } from "@/lib/money";

const initialState: InventoryActionState = {};

type ProductFormProps = {
  mode: "create" | "edit";
  product?: ProductDetail;
  categories: ProductCategoryItem[];
  cancelHref: string;
};

export function ProductForm({ mode, product, categories, cancelHref }: ProductFormProps) {
  const action =
    mode === "edit" && product
      ? updateProductAction.bind(null, product.id)
      : createProductAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <div className="space-y-2">
        <Label htmlFor="name">Nome *</Label>
        <Input id="name" name="name" defaultValue={product?.name} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="barcode">Código de barras</Label>
          <Input id="barcode" name="barcode" defaultValue={product?.barcode ?? ""} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoria</Label>
          <Select id="categoryId" name="categoryId" defaultValue={product?.categoryId ?? ""}>
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit">Unidade *</Label>
          <Select id="unit" name="unit" defaultValue={product?.unit ?? "unit"} required>
            {PRODUCT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {PRODUCT_UNIT_LABELS[unit]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={product?.description ?? ""}
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="costPrice">
            {mode === "edit" ? "Custo médio atual" : "Custo unitário"}
          </Label>
          <Input
            id="costPrice"
            name="costPrice"
            defaultValue={
              product ? formatCentsToInput(product.costPriceCents) : "0,00"
            }
            inputMode="decimal"
            readOnly={mode === "edit"}
            className={mode === "edit" ? "bg-muted/40" : undefined}
          />
          {mode === "edit" ? (
            <p className="text-xs text-muted-foreground">
              O custo médio é atualizado automaticamente nas entradas.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="salePrice">Preço de venda</Label>
          <Input
            id="salePrice"
            name="salePrice"
            defaultValue={
              product?.salePriceCents != null ? formatCentsToInput(product.salePriceCents) : ""
            }
            placeholder="Opcional"
            inputMode="decimal"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="minimumStock">Estoque mínimo</Label>
        <Input
          id="minimumStock"
          name="minimumStock"
          defaultValue={product ? formatQuantity(product.minimumStock) : "0"}
          inputMode="decimal"
        />
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={product?.active ?? true}
            className="size-4 rounded border"
          />
          Produto ativo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="trackStock"
            defaultChecked={product?.trackStock ?? true}
            className="size-4 rounded border"
          />
          Controlar estoque
        </label>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={isPending}>
          {isPending ? "Salvando..." : mode === "edit" ? "Salvar alterações" : "Cadastrar produto"}
        </Button>
        <ButtonLink href={cancelHref} variant="outline" className="min-h-11 w-full sm:w-auto">
          Cancelar
        </ButtonLink>
      </div>
    </form>
  );
}
