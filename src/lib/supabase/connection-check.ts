import { hasPublicEnv } from "@/lib/env/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SupabaseConnectionStatus =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

/**
 * Verifica se o projeto consegue inicializar o cliente Supabase e
 * conversar com a API de autenticação (sem depender de tabelas de negócio).
 */
export async function checkSupabaseConnection(): Promise<SupabaseConnectionStatus> {
  if (!hasPublicEnv()) {
    return {
      ok: false,
      message:
        "Variáveis do Supabase ausentes. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.getSession();

    if (error) {
      return {
        ok: false,
        message:
          "Não foi possível validar a conexão com o Supabase. Revise URL e Publishable Key no .env.local.",
      };
    }

    return {
      ok: true,
      message: "Conexão com o Supabase validada com sucesso.",
    };
  } catch {
    return {
      ok: false,
      message:
        "Falha ao inicializar o cliente Supabase. Verifique as variáveis de ambiente.",
    };
  }
}
