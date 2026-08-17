"use client";

import { useTransition } from "react";

import { toggleServicePackageActiveAction } from "@/features/service-packages/actions";
import { Button } from "@/components/ui/button";

type ToggleServicePackageActiveButtonProps = {
  packageId: string;
  active: boolean;
};

export function ToggleServicePackageActiveButton({
  packageId,
  active,
}: ToggleServicePackageActiveButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await toggleServicePackageActiveAction(packageId, !active);
        });
      }}
    >
      {isPending ? "Salvando…" : active ? "Desativar" : "Ativar"}
    </Button>
  );
}
