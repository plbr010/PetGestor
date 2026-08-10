"use client";

import { useState, useTransition } from "react";

import { archiveEmployeeAction } from "@/features/employees/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";

type ArchiveEmployeeButtonProps = {
  employeeId: string;
};

export function ArchiveEmployeeButton({ employeeId }: ArchiveEmployeeButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm("Deseja arquivar este funcionário?");

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await archiveEmployeeAction(employeeId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? <FormFeedback message={error} variant="error" /> : null}
      <Button type="button" variant="destructive" disabled={isPending} onClick={handleClick}>
        {isPending ? "Arquivando..." : "Arquivar funcionário"}
      </Button>
    </div>
  );
}
