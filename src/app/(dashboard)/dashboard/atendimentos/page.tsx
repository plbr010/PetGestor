import { ServiceOrderCard } from "@/features/service-orders/components/service-order-card";
import { ServiceOrderFilters } from "@/features/service-orders/components/service-order-filters";
import { ServiceOrdersBoard } from "@/features/service-orders/components/service-orders-board";
import { parseServiceOrderStatusFilter } from "@/features/service-orders/status";
import { getServiceOrdersForToday } from "@/features/service-orders/queries";
import { parseServiceOrderDate } from "@/features/service-orders/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AtendimentosPageProps = {
  searchParams: Promise<{ date?: string; status?: string }>;
};

export default async function AtendimentosPage({ searchParams }: AtendimentosPageProps) {
  const context = await requireCompanyContext();
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const date = parseServiceOrderDate(query.date, timeZone);
  const status = parseServiceOrderStatusFilter(query.status);

  const orders = await getServiceOrdersForToday(
    context.membership.company.id,
    date,
    timeZone,
    status,
  );

  const showBoard = status === "all" || status === "waiting" || status === "in_progress" || status === "ready";
  const hasActiveOrders = orders.some(
    (order) => order.status === "waiting" || order.status === "in_progress" || order.status === "ready",
  );

  return (
    <>
      <DashboardHeader
        title="Atendimentos"
        description="Acompanhe os pets desde a chegada até a entrega."
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceOrderFilters date={date} status={status} />
          </CardContent>
        </Card>

        {orders.length === 0 ? (
          <EmptyState
            title="Nenhum atendimento neste período"
            description="Faça check-in de um agendamento na agenda para iniciar o fluxo."
          />
        ) : showBoard && hasActiveOrders ? (
          <ServiceOrdersBoard orders={orders} timeZone={timeZone} />
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li key={order.id}>
                <ServiceOrderCard order={order} timeZone={timeZone} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
