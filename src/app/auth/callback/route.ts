import { redirect } from "next/navigation";

import { resolveAuthCallbackPath } from "@/lib/auth/callback";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");

  if (!code?.trim()) {
    redirect(resolveAuthCallbackPath({ code, next, exchangeFailed: false }));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  redirect(
    resolveAuthCallbackPath({
      code,
      next,
      exchangeFailed: Boolean(error),
    }),
  );
}
