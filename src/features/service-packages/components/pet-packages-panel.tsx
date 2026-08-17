"use client";

import { useState, useTransition } from "react";

import {
  cancelCustomerPackageAction,
  type ServicePackageActionState,
} from "@/features/service-packages/actions";
import {
  CUSTOMER_PACKAGE_STATUS_LABELS,
} from "@/features/service-packages/utils";
import type { CustomerPackageListItem } from "@/features/service-packages/types";
import { formatDateDisplay } from "@/lib/pet-display";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PetPackagesPanelProps = {
  petId: string;
  packages: CustomerPackageListItem[];
  sold?: boolean;
};

function ProgressBar({ used, total }: { used: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {used} de {total} utilizados · {total - used} restante{total - used === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function PetPackagesPanel({ petId, packages, sold }: PetPackagesPanelProps) {
  const activePackages = packages.filter((pkg) => pkg.status === "active");
  const historyPackages = packages.filter((pkg) => pkg.status !== "active");

  return (
    <div className="space-y-6">
      {sold ? (
        <FormFeedback message="Pacote adicionado com sucesso." variant="success" />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pacotes ativos</CardTitle>
          <CardDescription>Direitos de consumo já pagos para este pet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activePackages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pacote ativo no momento.</p>
          ) : (
            activePackages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} petId={petId} />
            ))
          )}
        </CardContent>
      </Card>

      {historyPackages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de pacotes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {historyPackages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} petId={petId} readonly />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PackageCard({
  pkg,
  petId,
  readonly = false,
}: {
  pkg: CustomerPackageListItem;
  petId: string;
  readonly?: boolean;
}) {
  const [message, setMessage] = useState<ServicePackageActionState>({});
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    if (!window.confirm("Cancelar este pacote? Só é possível se ainda não houver consumos.")) {
      return;
    }

    startTransition(async () => {
      const result = await cancelCustomerPackageAction(pkg.id, petId);
      setMessage(result);
    });
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{pkg.package_name_snapshot}</p>
          <p className="text-sm text-muted-foreground">
            Válido até {formatDateDisplay(pkg.expires_at)}
          </p>
        </div>
        <Badge variant={pkg.status === "active" ? "default" : "secondary"}>
          {CUSTOMER_PACKAGE_STATUS_LABELS[pkg.status]}
        </Badge>
      </div>

      <ProgressBar used={pkg.total_used} total={pkg.total_quantity} />

      <ul className="space-y-1 text-sm text-muted-foreground">
        {pkg.items.map((item) => (
          <li key={item.id}>
            {item.service_name}: {item.quantity_used}/{item.quantity_total}
          </li>
        ))}
      </ul>

      {message.success ? <FormFeedback message={message.success} variant="success" /> : null}
      {message.error ? <FormFeedback message={message.error} variant="error" /> : null}

      {!readonly && pkg.status === "active" && pkg.total_used === 0 ? (
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleCancel}>
          {isPending ? "Cancelando…" : "Cancelar pacote"}
        </Button>
      ) : null}
    </div>
  );
}
