import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { runCompleteOnboarding } from "@/features/auth/actions";
import { peekPendingInvite } from "@/features/employees/access/accept-invite";
import { buildDashboardTrialStartedHref } from "@/lib/analytics/meta-pixel";
import { isValidBrazilianPhone, toE164Brazil } from "@/lib/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!tokenHash || !type) {
    redirect("/auth/erro?motivo=confirmacao-invalida");
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });

  if (error) {
    redirect("/auth/erro?motivo=confirmacao-falhou");
  }

  const pending = await peekPendingInvite();

  if (pending.found) {
    redirect("/convite");
  }

  const { data: userData } = await supabase.auth.getUser();
  const metadata = userData.user?.user_metadata ?? {};
  const signupMode = metadata.signup_mode === "staff" ? "staff" : "owner";

  if (signupMode === "staff") {
    redirect("/convite");
  }

  const fullName =
    typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const companyName =
    typeof metadata.company_name === "string" ? metadata.company_name.trim() : "";
  const rawPhone = typeof metadata.phone === "string" ? metadata.phone : "";
  const phone =
    rawPhone && isValidBrazilianPhone(rawPhone) ? toE164Brazil(rawPhone) : "";

  if (fullName && companyName && phone) {
    const onboardingResult = await runCompleteOnboarding(fullName, companyName, phone);

    if (!onboardingResult.ok) {
      redirect("/onboarding");
    }

    redirect(buildDashboardTrialStartedHref("/dashboard"));
  }

  redirect("/onboarding");
}
