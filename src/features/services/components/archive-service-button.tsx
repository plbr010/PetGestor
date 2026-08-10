"use client";

import { useState, useTransition } from "react";

import { archiveServiceAction } from "@/features/services/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";

type ArchiveServiceButtonProps = {
  serviceId: string;
};

export function ArchiveServiceButton({ serviceId }: ArchiveServiceButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm("Deseja arquivar este serviço?");

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await archiveServiceAction(serviceId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? <FormFeedback message={error} variant="error" /> : null}
      <Button type="button" variant="destructive" disabled={isPending} onClick={handleClick}>
        {isPending ? "Arquivando..." : "Arquivar serviço"}
      </Button>
    </div>
  );
}
