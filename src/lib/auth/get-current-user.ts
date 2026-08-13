import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthUser } from "@/features/auth/types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  let email: string | null =
    typeof data.claims.email === "string" ? data.claims.email : null;

  // getClaims() nem sempre inclui email no JWT; getUser() resolve via Auth API.
  if (!email) {
    const { data: userData } = await supabase.auth.getUser();
    email = userData.user?.email ?? null;
  }

  return {
    id: data.claims.sub,
    email,
  };
}
