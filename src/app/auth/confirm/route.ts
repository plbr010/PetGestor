import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { runCompleteOnboarding } from "@/features/auth/actions";
import { tryAcceptPendingInvite } from "@/features/employees/access/accept-invite";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { isValidBrazilianPhone, toE164Brazil } from "@/lib/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = getSafeRedirectPath(requestUrl.searchParams.get("next"));

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

  const { data: userData } = await supabase.auth.getUser();
  const metadata = userData.user?.user_metadata ?? {};
  const fullName =
    typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const companyName =
    typeof metadata.company_name === "string" ? metadata.company_name.trim() : "";
  const rawPhone = typeof metadata.phone === "string" ? metadata.phone : "";
  const phone =
    rawPhone && isValidBrazilianPhone(rawPhone) ? toE164Brazil(rawPhone) : "";

  if (fullName && companyName && phone) {
    const inviteResult = await tryAcceptPendingInvite();

    if (inviteResult.accepted) {
      redirect("/dashboard?convite-aceito=1");
    }

    const onboardingResult = await runCompleteOnboarding(fullName, companyName, phone);

    if (!onboardingResult.ok) {
      redirect("/onboarding");
    }
  } else {
    const inviteResult = await tryAcceptPendingInvite();

    if (inviteResult.accepted) {
      redirect("/dashboard?convite-aceito=1");
    }

    redirect("/onboarding");
  }

  redirect(next);
}
