import { redirect } from "next/navigation";

import type { AuthUser } from "@/features/auth/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function requireUser(loginPath = "/entrar"): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(loginPath);
  }

  return user;
}
