"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toggleEmployeeActiveAction } from "@/features/employees/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";

type ToggleEmployeeActiveButtonProps = {
  employeeId: string;
  active: boolean;
};

export function ToggleEmployeeActiveButton({
  employeeId,
  active,
}: ToggleEmployeeActiveButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await toggleEmployeeActiveAction(employeeId, !active);

      if (result?.error) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? <FormFeedback message={error} variant="error" /> : null}
      <Button type="button" variant="outline" disabled={isPending} onClick={handleClick}>
        {isPending ? "Salvando..." : active ? "Desativar" : "Ativar"}
      </Button>
    </div>
  );
}
