"use client";

import { useActionState } from "react";

import {
  createSupplierAction,
  updateSupplierAction,
  type InventoryActionState,
} from "@/features/inventory/actions";
import type { InventorySupplierItem } from "@/features/inventory/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPhoneInput } from "@/lib/phone";

const initialState: InventoryActionState = {};

export function SupplierForm({
  mode,
  supplier,
  cancelHref,
}: {
  mode: "create" | "edit";
  supplier?: InventorySupplierItem;
  cancelHref: string;
}) {
  const action =
    mode === "edit" && supplier
      ? updateSupplierAction.bind(null, supplier.id)
      : createSupplierAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <div className="space-y-2">
        <Label htmlFor="name">Nome *</Label>
        <Input id="name" name="name" defaultValue={supplier?.name} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactName">Contato</Label>
        <Input id="contactName" name="contactName" defaultValue={supplier?.contact_name ?? ""} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={supplier?.phone ? formatPhoneInput(supplier.phone) : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="document">Documento</Label>
        <Input id="document" name="document" defaultValue={supplier?.document ?? ""} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea id="notes" name="notes" defaultValue={supplier?.notes ?? ""} rows={3} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={supplier?.active ?? true}
          className="size-4 rounded border"
        />
        Fornecedor ativo
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={isPending}>
          {isPending ? "Salvando..." : mode === "edit" ? "Salvar alterações" : "Cadastrar fornecedor"}
        </Button>
        <ButtonLink href={cancelHref} variant="outline" className="min-h-11 w-full sm:w-auto">
          Cancelar
        </ButtonLink>
      </div>
    </form>
  );
}
