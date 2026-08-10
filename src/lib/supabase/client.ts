import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env/public-env";
import type { Database } from "@/types/database.types";

export function createSupabaseBrowserClient() {
  const env = getPublicEnv();

  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
