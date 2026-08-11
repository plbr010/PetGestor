import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env/public-env";
import type { Database } from "@/types/database.types";

export async function createSupabaseServerClient() {
  // cookies() primeiro: durante `next build`, isso marca a rota como dinâmica
  // antes de validar env. Se getPublicEnv() rodar antes, o prerender quebra com
  // PublicEnvError em páginas auth/dashboard quando NEXT_PUBLIC_* ainda não
  // estão disponíveis no worker de SSG (cenário típico de deploy Vercel).
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components não podem gravar cookies; rotas com mutação cuidarão disso.
          }
        },
      },
    },
  );
}
