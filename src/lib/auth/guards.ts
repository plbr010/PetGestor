import { redirect } from "next/navigation";

import { getCurrentCompanyMembership } from "@/features/companies/queries";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function redirectIfAuthenticated(options?: {
  allowWithoutCompany?: boolean;
}): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    return;
  }

  const membership = await getCurrentCompanyMembership(user.id);

  if (membership) {
    redirect("/dashboard");
  }

  if (!options?.allowWithoutCompany) {
    redirect("/onboarding");
  }
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/entrar");
  }

  return user;
}

export async function requireAuthenticatedWithoutCompany() {
  const user = await requireAuthenticatedUser();
  const membership = await getCurrentCompanyMembership(user.id);

  if (membership) {
    redirect("/dashboard");
  }

  return user;
}

export async function requireRecoverySession() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/recuperar-senha");
  }

  return user;
}
