import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ProfileSettingsContent } from "@/components/dashboard/profile-settings-content";
import {
  NotificationHistoryList,
  NotificationSettingsForm,
} from "@/features/notifications/components/notification-settings-panel";
import {
  getCompanyNotificationSettings,
  listNotificationHistory,
} from "@/features/notifications/queue-service";

type SettingsPageProps = {
  searchParams: Promise<{
    "senha-atualizada"?: string;
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const passwordUpdated = params["senha-atualizada"] === "1";
  const context = await requireCompanyContext();
  const companyId = context.membership.company.id;
  const supabase = await createSupabaseServerClient();

  const [settings, history] = await Promise.all([
    getCompanyNotificationSettings(supabase, companyId),
    listNotificationHistory(supabase, companyId),
  ]);

  return (
    <>
      <DashboardHeader title="Configurações" description="perfil e segurança da conta" />
      {passwordUpdated ? (
        <div
          className="mx-4 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground sm:mx-6"
          role="status"
        >
          Senha atualizada com sucesso.
        </div>
      ) : null}
      <ProfileSettingsContent
        notificationSettings={<NotificationSettingsForm settings={settings} />}
        notificationHistory={<NotificationHistoryList items={history} timeZone={context.membership.company.timezone} />}
      />
    </>
  );
}
