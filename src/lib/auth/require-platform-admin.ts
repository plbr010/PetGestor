import "server-only";

import { notFound } from "next/navigation";

import { isAllowlistedPlatformAdminEmail } from "@/config/platform-admin";
import type { AuthUser } from "@/features/auth/types";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function isPlatformAdmin(user: AuthUser): Promise<boolean> {
  if (isAllowlistedPlatformAdminEmail(user.email)) {
    return true;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return data.user_id === user.id;
}

/**
 * Gate server-side do painel interno.
 * Não-admins recebem 404 (sem revelar existência da rota administrativa).
 */
export async function requirePlatformAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  const allowed = await isPlatformAdmin(user);

  if (!allowed) {
    notFound();
  }

  return user;
}
