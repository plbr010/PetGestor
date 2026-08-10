"use client";

import { useEffect } from "react";

import { ErrorMessage } from "@/components/shared/error-message";
import { Button } from "@/components/ui/button";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("Dashboard error:", error.message);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4">
        <ErrorMessage
          title="Erro ao carregar o dashboard"
          message="Ocorreu um problema inesperado. Tente novamente."
        />
        <Button onClick={reset}>Tentar novamente</Button>
      </div>
    </div>
  );
}
