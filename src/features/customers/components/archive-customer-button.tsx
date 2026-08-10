"use client";

import { useState, useTransition } from "react";

import { archiveCustomerAction } from "@/features/customers/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";

type ArchiveCustomerButtonProps = {
  customerId: string;
  disabled?: boolean;
};

export function ArchiveCustomerButton({
  customerId,
  disabled = false,
}: ArchiveCustomerButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      "Deseja arquivar este tutor? Ele deixará de aparecer nas listagens ativas.",
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await archiveCustomerAction(customerId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? <FormFeedback message={error} variant="error" /> : null}
      <Button
        type="button"
        variant="destructive"
        disabled={disabled || isPending}
        onClick={handleClick}
      >
        {isPending ? "Arquivando..." : "Arquivar tutor"}
      </Button>
    </div>
  );
}
