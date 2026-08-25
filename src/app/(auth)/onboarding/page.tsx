import { createSupabaseServerClient } from "@/lib/supabase/server";
import { peekPendingInvite } from "@/features/employees/access/accept-invite";
import { requireAuthenticatedWithoutCompany } from "@/lib/auth/guards";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  await requireAuthenticatedWithoutCompany();

  const pending = await peekPendingInvite();

  if (pending.found) {
    redirect("/convite");
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const metadata = data.user?.user_metadata ?? {};

  if (metadata.signup_mode === "staff") {
    redirect("/convite");
  }

  const defaultFullName =
    typeof metadata.full_name === "string" ? metadata.full_name : "";
  const defaultCompanyName =
    typeof metadata.company_name === "string" ? metadata.company_name : "";
  const defaultPhone = typeof metadata.phone === "string" ? metadata.phone : "";

  return (
    <AuthShell showLogout>
      <OnboardingForm
        defaultFullName={defaultFullName}
        defaultCompanyName={defaultCompanyName}
        defaultPhone={defaultPhone}
      />
    </AuthShell>
  );
}
