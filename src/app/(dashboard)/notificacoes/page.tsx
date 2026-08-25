import { DashboardHeader } from "@/components/layout/dashboard-header";
import { listAppNotificationsPageAction } from "@/features/app-notifications/actions";
import { NotificationsPageClient } from "@/features/app-notifications/components/notifications-page-client";
import { requirePermission } from "@/lib/auth/require-permission";

type NotificacoesPageProps = {
  searchParams: Promise<{ filtro?: string }>;
};

export default async function NotificacoesPage({ searchParams }: NotificacoesPageProps) {
  await requirePermission("dashboard.view");

  const params = await searchParams;
  const filter =
    params.filtro === "lidas" ? "read" : params.filtro === "nao-lidas" ? "unread" : "all";

  const items = await listAppNotificationsPageAction(filter);

  return (
    <>
      <DashboardHeader
        title="Notificações"
        description="Alertas do pet shop nesta conta"
      />
      <main className="flex-1 overflow-x-hidden p-4 sm:p-6">
        <NotificationsPageClient initialItems={items} initialFilter={filter} />
      </main>
    </>
  );
}
