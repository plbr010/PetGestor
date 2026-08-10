import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ProfileSettingsContent } from "@/components/dashboard/profile-settings-content";

type SettingsPageProps = {
  searchParams: Promise<{
    "senha-atualizada"?: string;
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const passwordUpdated = params["senha-atualizada"] === "1";

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
      <ProfileSettingsContent />
    </>
  );
}
