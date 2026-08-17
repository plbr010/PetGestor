"use client";

import { useActionState } from "react";

import {
  updatePetImportantInfoAction,
  type PetActionState,
} from "@/features/pets/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PetImportantInfoPanelProps = {
  petId: string;
  allergies: string | null;
  importantNotes: string | null;
  saved?: boolean;
};

const initialState: PetActionState = {};

export function PetImportantInfoPanel({
  petId,
  allergies,
  importantNotes,
  saved,
}: PetImportantInfoPanelProps) {
  const [state, formAction, isPending] = useActionState(
    updatePetImportantInfoAction.bind(null, petId),
    initialState,
  );

  const hasContent = Boolean(allergies?.trim() || importantNotes?.trim());

  return (
    <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
      <CardHeader>
        <CardTitle>Informações importantes</CardTitle>
        <CardDescription>
          Visualize e atualize cuidados críticos antes de iniciar um atendimento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {saved ? (
          <FormFeedback message="Informações importantes salvas." variant="success" />
        ) : null}
        {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
        {state.success ? <FormFeedback message={state.success} variant="success" /> : null}

        {!hasContent && !isPending ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma informação crítica cadastrada ainda.
          </p>
        ) : null}

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="allergies">Alergias</Label>
            <Textarea
              id="allergies"
              name="allergies"
              defaultValue={allergies ?? ""}
              placeholder="Ex.: alergia a shampoo com perfume"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="importantNotes">Cuidados e comportamento</Label>
            <Textarea
              id="importantNotes"
              name="importantNotes"
              defaultValue={importantNotes ?? ""}
              placeholder="Ex.: medo de secador, não usar perfume, sensível às patas..."
              rows={4}
            />
          </div>
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending ? "Salvando…" : "Salvar informações importantes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
