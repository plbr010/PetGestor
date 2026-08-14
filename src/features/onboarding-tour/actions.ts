"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OnboardingTourActionState = {
  error?: string;
  success?: boolean;
};

/**
 * Marca o tutorial como concluído/pulado para o usuário autenticado.
 * Não aceita user_id do cliente — usa auth.uid() via RPC.
 */
export async function completeOnboardingTutorialAction(): Promise<OnboardingTourActionState> {
  await requireUser();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_onboarding_tutorial");

  if (error) {
    return { error: "Não foi possível salvar o progresso do tutorial." };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/configuracoes");

  return { success: true };
}
