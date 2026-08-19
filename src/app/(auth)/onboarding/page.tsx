import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tryAcceptPendingInvite } from "@/features/employees/access/accept-invite";
import { requireAuthenticatedWithoutCompany } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export default async function OnboardingPage() {
  await requireAuthenticatedWithoutCompany();

  const inviteResult = await tryAcceptPendingInvite();

  if (inviteResult.accepted) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard?convite-aceito=1");
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const metadata = data.user?.user_metadata ?? {};

  const defaultFullName =
    typeof metadata.full_name === "string" ? metadata.full_name : "";
  const defaultCompanyName =
    typeof metadata.company_name === "string" ? metadata.company_name : "";
  const defaultPhone = typeof metadata.phone === "string" ? metadata.phone : "";

  return (
    <AuthShell>
      <OnboardingForm
        defaultFullName={defaultFullName}
        defaultCompanyName={defaultCompanyName}
        defaultPhone={defaultPhone}
      />
    </AuthShell>
  );
}
