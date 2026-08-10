"use client";

import { useActionState } from "react";

import {
  createPetAction,
  type PetActionState,
} from "@/features/pets/actions";
import type { CustomerOption } from "@/features/customers/types";
import type { PetDetail } from "@/features/pets/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPhoneDisplay } from "@/lib/phone";

const initialState: PetActionState = {};

type PetFormProps = {
  mode: "create" | "edit";
  customers: CustomerOption[];
  pet?: PetDetail;
  defaultCustomerId?: string;
  cancelHref: string;
  action?: (state: PetActionState, formData: FormData) => Promise<PetActionState>;
};

export function PetForm({
  mode,
  customers,
  pet,
  defaultCustomerId,
  cancelHref,
  action,
}: PetFormProps) {
  const [state, formAction, isPending] = useActionState(action ?? createPetAction, initialState);
  const selectedCustomerId = pet?.customer_id ?? defaultCustomerId ?? "";

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

      <div className="space-y-2">
        <Label htmlFor="name">Nome *</Label>
        <Input
          id="name"
          name="name"
          defaultValue={pet?.name}
          placeholder="Ex.: Thor"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="customerId">Tutor *</Label>
        <Select id="customerId" name="customerId" defaultValue={selectedCustomerId} required>
          <option value="" disabled>
            Selecione um tutor
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} · {formatPhoneDisplay(customer.phone)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="species">Espécie *</Label>
          <Select id="species" name="species" defaultValue={pet?.species ?? "dog"} required>
            <option value="dog">Cão</option>
            <option value="cat">Gato</option>
            <option value="other">Outro</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sex">Sexo</Label>
          <Select id="sex" name="sex" defaultValue={pet?.sex ?? "unknown"}>
            <option value="unknown">Não informado</option>
            <option value="male">Macho</option>
            <option value="female">Fêmea</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="breed">Raça</Label>
          <Input id="breed" name="breed" defaultValue={pet?.breed ?? ""} placeholder="Ex.: SRD" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="birthDate">Data de nascimento</Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={pet?.birth_date ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="weightKg">Peso (kg)</Label>
          <Input
            id="weightKg"
            name="weightKg"
            defaultValue={pet?.weight_kg?.toString() ?? ""}
            placeholder="Ex.: 12,5"
            inputMode="decimal"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="color">Cor</Label>
          <Input id="color" name="color" defaultValue={pet?.color ?? ""} placeholder="Ex.: Caramelo" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="allergies">Alergias</Label>
        <Textarea
          id="allergies"
          name="allergies"
          defaultValue={pet?.allergies ?? ""}
          placeholder="Informe alergias conhecidas, se houver."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={pet?.notes ?? ""}
          placeholder="Temperamento, cuidados especiais..."
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href={cancelHref} variant="outline">
          Cancelar
        </ButtonLink>
        <Button type="submit" disabled={isPending || customers.length === 0}>
          {isPending ? "Salvando..." : mode === "create" ? "Salvar pet" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
