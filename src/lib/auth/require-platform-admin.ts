import "server-only";

import { notFound } from "next/navigation";

import type { AuthUser } from "@/features/auth/types";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return data.user_id === userId;
}

/**
 * Gate server-side do painel interno.
 * Não-admins recebem 404 (sem revelar existência da rota administrativa).
 */
export async function requirePlatformAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  const allowed = await isPlatformAdmin(user.id);

  if (!allowed) {
    notFound();
  }

  return user;
}
