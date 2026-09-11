"use client";

import { useState, useTransition } from "react";

import {
  cancelCustomerPackageAction,
  type ServicePackageActionState,
} from "@/features/service-packages/actions";
import {
  CUSTOMER_PACKAGE_STATUS_LABELS,
} from "@/features/service-packages/utils";
import type { CustomerPackageDisplayStatus, CustomerPackageListItem } from "@/features/service-packages/types";
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

function badgeVariant(status: CustomerPackageDisplayStatus): "default" | "secondary" | "outline" {
  if (status === "active") {
    return "default";
  }

  if (status === "pending_payment") {
    return "outline";
  }

  return "secondary";
}

export function PetPackagesPanel({ petId, packages, sold }: PetPackagesPanelProps) {
  const pendingPackages = packages.filter((pkg) => pkg.status === "pending_payment");
  const activePackages = packages.filter((pkg) => pkg.status === "active");
  const historyPackages = packages.filter(
    (pkg) => pkg.status !== "active" && pkg.status !== "pending_payment",
  );

  return (
    <div className="space-y-6">
      {sold ? (
        <FormFeedback message="Pacote adicionado com sucesso." variant="success" />
      ) : null}

      {pendingPackages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pagamento pendente</CardTitle>
            <CardDescription>
              O registro existe, mas este pacote ainda não é crédito utilizável na agenda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingPackages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} petId={petId} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pacotes ativos</CardTitle>
          <CardDescription>Sessões já pagas e disponíveis para este pet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activePackages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pacote pago e ativo no momento.</p>
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
  const canCancelPending = !readonly && pkg.status === "pending_payment" && pkg.total_used === 0;

  function handleCancel() {
    if (!window.confirm("Cancelar este pacote pendente? A receita pendente também será cancelada.")) {
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
        <Badge variant={badgeVariant(pkg.status)}>
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

      {pkg.status === "pending_payment" ? (
        <p className="text-sm text-muted-foreground">
          Pagamento pendente. Este pacote não aparece como crédito na agenda e não desconta sessão.
        </p>
      ) : null}

      {pkg.financial_status === "paid" && pkg.total_used === 0 && pkg.status === "active" ? (
        <p className="text-sm text-muted-foreground">
          Pacote pago. Para cancelar, faça o estorno/reembolso financeiro antes.
        </p>
      ) : null}

      {message.success ? <FormFeedback message={message.success} variant="success" /> : null}
      {message.error ? <FormFeedback message={message.error} variant="error" /> : null}

      {canCancelPending ? (
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleCancel}>
          {isPending ? "Cancelando…" : "Cancelar pacote"}
        </Button>
      ) : null}
    </div>
  );
}