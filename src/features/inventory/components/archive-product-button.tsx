"use client";

import { useState, useTransition } from "react";

import { archiveProductAction } from "@/features/inventory/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";

export function ArchiveProductButton({ productId }: { productId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm("Deseja arquivar este produto?");

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await archiveProductAction(productId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? <FormFeedback message={error} variant="error" /> : null}
      <Button type="button" variant="destructive" disabled={isPending} onClick={handleClick}>
        {isPending ? "Arquivando..." : "Arquivar produto"}
      </Button>
    </div>
  );
}
