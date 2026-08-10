import type { CompanyEntitlement } from "@/features/subscription/types";
import { formatTrialBannerMessage } from "@/features/subscription/utils";

type TrialBannerProps = {
  entitlement: CompanyEntitlement;
};

export function TrialBanner({ entitlement }: TrialBannerProps) {
  if (entitlement.state !== "trialing" || !entitlement.subscription) {
    return null;
  }

  const message = formatTrialBannerMessage(
    entitlement.subscription.trialEndsAt,
    new Date(entitlement.serverNowIso),
  );

  return (
    <div
      className="border-b bg-primary/5 px-4 py-2.5 text-center text-sm text-foreground sm:px-6"
      role="status"
    >
      {message}
    </div>
  );
}
