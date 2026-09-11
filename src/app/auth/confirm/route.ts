import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { runCompleteOnboarding } from "@/features/auth/actions";
import { peekPendingInvite } from "@/features/employees/access/accept-invite";
import { resolveEmailConfirmLanding } from "@/lib/auth/auth-redirects";
import { isValidBrazilianPhone, toE164Brazil } from "@/lib/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_OTP_TYPES: EmailOtpType[] = [
  "email",
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
];

function isEmailOtpType(value: string): value is EmailOtpType {
  return ALLOWED_OTP_TYPES.includes(value as EmailOtpType);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next");

  if (!tokenHash || !type || !isEmailOtpType(type)) {
    redirect("/auth/erro?motivo=confirmacao-invalida");
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    redirect("/auth/erro?motivo=confirmacao-falhou");
  }

  const pending = await peekPendingInvite();
  const { data: userData } = await supabase.auth.getUser();
  const metadata = userData.user?.user_metadata ?? {};
  const signupMode = metadata.signup_mode === "staff" ? "staff" : "owner";

  if (pending.found || signupMode === "staff") {
    redirect(
      resolveEmailConfirmLanding({
        pendingInvite: pending.found,
        signupMode,
        onboardingOk: false,
        onboardingRevoked: false,
        next,
      }),
    );
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

    redirect(
      resolveEmailConfirmLanding({
        pendingInvite: false,
        signupMode: "owner",
        onboardingOk: onboardingResult.ok,
        onboardingRevoked: !onboardingResult.ok && onboardingResult.reason === "revoked",
        next,
      }),
    );
  }

  redirect("/onboarding");
}
