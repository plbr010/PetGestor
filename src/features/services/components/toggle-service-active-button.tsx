"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toggleServiceActiveAction } from "@/features/services/actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";

type ToggleServiceActiveButtonProps = {
  serviceId: string;
  active: boolean;
};

export function ToggleServiceActiveButton({
  serviceId,
  active,
}: ToggleServiceActiveButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await toggleServiceActiveAction(serviceId, !active);

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
