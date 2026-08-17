"use client";

import { useActionState } from "react";

import {
  sellCustomerPackageAction,
  type ServicePackageActionState,
} from "@/features/service-packages/actions";
import type { ServicePackageListItem } from "@/features/service-packages/types";
import { formatCentsToBRL } from "@/lib/money";
import { getTodayInTimezone } from "@/lib/timezone";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type SellPackageFormProps = {
  petId: string;
  packages: ServicePackageListItem[];
  timeZone: string;
};

const initialState: ServicePackageActionState = {};

export function SellPackageForm({ petId, packages, timeZone }: SellPackageFormProps) {
  const [state, formAction, isPending] = useActionState(
    sellCustomerPackageAction.bind(null, petId),
    initialState,
  );

  if (packages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum pacote ativo disponível para venda. Cadastre pacotes em Serviços → Pacotes.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <div className="space-y-2">
        <Label htmlFor="packageId">Pacote *</Label>
        <Select id="packageId" name="packageId" defaultValue={packages[0]?.id}>
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name} — {formatCentsToBRL(pkg.price_cents)} · {pkg.validity_days} dias
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="startsAt">Data inicial *</Label>
        <Input
          id="startsAt"
          name="startsAt"
          type="date"
          defaultValue={getTodayInTimezone(timeZone)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="financialStatus">Pagamento *</Label>
        <Select id="financialStatus" name="financialStatus" defaultValue="pending">
          <option value="pending">Pendente</option>
          <option value="paid">Pago agora</option>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="paymentMethod">Forma de pagamento (se pago)</Label>
        <Select id="paymentMethod" name="paymentMethod" defaultValue="">
          <option value="">Selecione…</option>
          <option value="pix">Pix</option>
          <option value="cash">Dinheiro</option>
          <option value="debit_card">Cartão débito</option>
          <option value="credit_card">Cartão crédito</option>
          <option value="bank_transfer">Transferência</option>
          <option value="other">Outro</option>
        </Select>
      </div>

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Registrando…" : "Adicionar pacote"}
      </Button>
    </form>
  );
}
