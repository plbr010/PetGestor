"use client";

import { useTransition } from "react";

import { archiveServicePackageAction } from "@/features/service-packages/actions";
import { Button } from "@/components/ui/button";

type ArchiveServicePackageButtonProps = {
  packageId: string;
};

export function ArchiveServicePackageButton({ packageId }: ArchiveServicePackageButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="destructive"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm("Arquivar este pacote? Ele não poderá mais ser vendido.")) {
          return;
        }

        startTransition(async () => {
          await archiveServicePackageAction(packageId);
        });
      }}
    >
      {isPending ? "Arquivando…" : "Arquivar pacote"}
    </Button>
  );
}
