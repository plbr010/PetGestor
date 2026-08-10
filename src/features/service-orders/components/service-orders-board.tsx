import { ServiceOrderCard } from "@/features/service-orders/components/service-order-card";
import { SERVICE_ORDER_STATUS_LABELS } from "@/features/service-orders/status";
import type { ServiceOrderListItem } from "@/features/service-orders/types";
import type { ServiceOrderStatus } from "@/types/database.types";

type ServiceOrdersBoardProps = {
  orders: ServiceOrderListItem[];
  timeZone: string;
};

const BOARD_COLUMNS: ServiceOrderStatus[] = ["waiting", "in_progress", "ready"];

export function ServiceOrdersBoard({ orders, timeZone }: ServiceOrdersBoardProps) {
  const activeOrders = orders.filter(
    (order) => order.status === "waiting" || order.status === "in_progress" || order.status === "ready",
  );

  return (
    <>
      <div className="hidden gap-4 xl:grid xl:grid-cols-3">
        {BOARD_COLUMNS.map((status) => {
          const columnOrders = activeOrders.filter((order) => order.status === status);

          return (
            <section key={status} className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-2">
                <h2 className="text-sm font-semibold">{SERVICE_ORDER_STATUS_LABELS[status]}</h2>
                <span className="text-xs text-muted-foreground">{columnOrders.length}</span>
              </div>
              <div className="space-y-3">
                {columnOrders.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Nenhum pet nesta etapa.
                  </p>
                ) : (
                  columnOrders.map((order) => (
                    <ServiceOrderCard key={order.id} order={order} timeZone={timeZone} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="space-y-8 xl:hidden">
        {BOARD_COLUMNS.map((status) => {
          const columnOrders = activeOrders.filter((order) => order.status === status);
          if (columnOrders.length === 0) {
            return null;
          }

          return (
            <section key={status} className="space-y-3">
              <h2 className="text-sm font-semibold">{SERVICE_ORDER_STATUS_LABELS[status]}</h2>
              <div className="space-y-3">
                {columnOrders.map((order) => (
                  <ServiceOrderCard key={order.id} order={order} timeZone={timeZone} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
