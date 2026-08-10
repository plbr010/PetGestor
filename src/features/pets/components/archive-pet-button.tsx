"use client";

import { useTransition } from "react";

import { archivePetAction } from "@/features/pets/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { useState } from "react";

type ArchivePetButtonProps = {
  petId: string;
};

export function ArchivePetButton({ petId }: ArchivePetButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm("Deseja arquivar este pet?");

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await archivePetAction(petId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? <FormFeedback message={error} variant="error" /> : null}
      <Button type="button" variant="destructive" disabled={isPending} onClick={handleClick}>
        {isPending ? "Arquivando..." : "Arquivar pet"}
      </Button>
    </div>
  );
}
