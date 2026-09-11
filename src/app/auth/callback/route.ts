import { redirect } from "next/navigation";

import { resolveAuthCallbackRedirect } from "@/lib/auth/auth-redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError = requestUrl.searchParams.get("error");
  const next = requestUrl.searchParams.get("next");

  if (providerError || !code) {
    redirect(
      resolveAuthCallbackRedirect({
        code,
        next,
        providerError,
        exchangeError: false,
      }).redirectTo,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  redirect(
    resolveAuthCallbackRedirect({
      code,
      next,
      providerError: null,
      exchangeError: Boolean(error),
    }).redirectTo,
  );
}
