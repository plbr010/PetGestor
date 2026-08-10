import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthUser } from "@/features/auth/types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  const emailClaim = data.claims.email;

  return {
    id: data.claims.sub,
    email: typeof emailClaim === "string" ? emailClaim : null,
  };
}
