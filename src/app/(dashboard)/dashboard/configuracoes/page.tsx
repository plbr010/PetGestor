import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ProfileSettingsContent } from "@/components/dashboard/profile-settings-content";
import { AutomaticMessagesPanel } from "@/features/notifications/components/notification-settings-panel";
import {
  getCompanyNotificationSettings,
  listNotificationHistory,
} from "@/features/notifications/queue-service";
import { getWhatsAppPublicStatus } from "@/features/notifications/whatsapp-public-status";
import { isPlatformAdmin } from "@/lib/auth/require-platform-admin";

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

  const [settings, history, whatsappStatus, platformAdmin] = await Promise.all([
    getCompanyNotificationSettings(supabase, companyId),
    listNotificationHistory(supabase, companyId),
    Promise.resolve(getWhatsAppPublicStatus()),
    isPlatformAdmin(context.user),
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
        automaticMessages={
          <AutomaticMessagesPanel
            settings={settings}
            history={history}
            timeZone={context.membership.company.timezone}
            companyName={context.membership.company.name}
            whatsappStatus={{
              configured: whatsappStatus.configured,
              sendEnabled: whatsappStatus.sendEnabled,
              checkedAt: whatsappStatus.checkedAt,
            }}
            showTestMessage={platformAdmin && whatsappStatus.canSendTest}
          />
        }
      />
    </>
  );
}
