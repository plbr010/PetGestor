"use client";

import { useActionState } from "react";

import {
  createCustomerAction,
  type CustomerActionState,
} from "@/features/customers/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPhoneDisplay, formatPhoneInput } from "@/lib/phone";
import type { CustomerDetail } from "@/features/customers/types";

const initialState: CustomerActionState = {};

type CustomerFormProps = {
  mode: "create" | "edit";
  customer?: CustomerDetail;
  cancelHref: string;
  action?: (
    state: CustomerActionState,
    formData: FormData,
  ) => Promise<CustomerActionState>;
};

export function CustomerForm({
  mode,
  customer,
  cancelHref,
  action,
}: CustomerFormProps) {
  const [state, formAction, isPending] = useActionState(
    action ?? createCustomerAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <div className="space-y-2">
        <Label htmlFor="name">Nome *</Label>
        <Input
          id="name"
          name="name"
          defaultValue={customer?.name}
          placeholder="Ex.: Ana Silva"
          autoComplete="name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Telefone *</Label>
        <Input
          id="phone"
          name="phone"
          defaultValue={customer ? formatPhoneDisplay(customer.phone) : ""}
          placeholder="(32) 99999-9999"
          autoComplete="tel"
          inputMode="tel"
          required
          onChange={(event) => {
            event.currentTarget.value = formatPhoneInput(event.currentTarget.value);
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={customer?.email ?? ""}
          placeholder="tutor@email.com"
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={customer?.notes ?? ""}
          placeholder="Preferências, observações importantes..."
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href={cancelHref} variant="outline">
          Cancelar
        </ButtonLink>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : mode === "create" ? "Salvar tutor" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
