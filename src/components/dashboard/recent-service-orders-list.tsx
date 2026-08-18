import Link from "next/link";

import { ServiceOrderStatusBadge } from "@/features/service-orders/components/service-order-status-badge";
import type { ServiceOrderListItem } from "@/features/service-orders/types";
import { formatDashboardWhenLabel, getServiceOrderActivityAt } from "@/features/service-orders/utils";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RecentServiceOrdersListProps = {
  orders: ServiceOrderListItem[];
  timeZone: string;
  today: string;
};

export function RecentServiceOrdersList({
  orders,
  timeZone,
  today,
}: RecentServiceOrdersListProps) {
  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Últimos atendimentos</CardTitle>
        <CardDescription>Atendimentos mais recentes do pet shop</CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed p-4 text-center">
            <p className="font-medium">Nenhum atendimento registrado ainda.</p>
            <p className="text-sm text-muted-foreground">
              Os atendimentos mais recentes aparecerão aqui.
            </p>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
              <ButtonLink href="/dashboard/agenda" variant="outline" size="sm">
                Ver agenda
              </ButtonLink>
              <ButtonLink href="/dashboard/atendimentos" size="sm">
                Ver atendimentos
              </ButtonLink>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/dashboard/atendimentos/${order.id}`}
                  className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{order.appointment.pet.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      Tutor: {order.appointment.customer.name}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {order.appointment.service_name_snapshot} •{" "}
                      {order.appointment.employee.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDashboardWhenLabel(
                        getServiceOrderActivityAt(order),
                        timeZone,
                        today,
                      )}
                    </p>
                  </div>
                  <div className="self-start sm:self-center">
                    <ServiceOrderStatusBadge status={order.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
