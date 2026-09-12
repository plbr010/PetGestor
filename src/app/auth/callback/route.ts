import { redirect } from "next/navigation";

import { resolveAuthCallbackPath } from "@/lib/auth/callback";
import {
  issueRecoveryMarkerCookie,
  resolveRecoverySecret,
  verifyRecoveryTicket,
} from "@/lib/auth/recovery-marker";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const flow = requestUrl.searchParams.get("flow");
  const recoveryTicket = requestUrl.searchParams.get("rt");

  if (!code?.trim()) {
    redirect(resolveAuthCallbackPath({ code, next, exchangeFailed: false }));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirect(resolveAuthCallbackPath({ code, next, exchangeFailed: true }));
  }

  if (flow === "recovery" && recoveryTicket) {
    let issued = false;
    try {
      const ticket = verifyRecoveryTicket(recoveryTicket, resolveRecoverySecret());
      if (ticket) {
        const { data } = await supabase.auth.getClaims();
        const userId = data?.claims?.sub;
        if (typeof userId === "string" && userId.length > 0) {
          await issueRecoveryMarkerCookie(userId);
          issued = true;
        }
      }
    } catch {
      redirect("/auth/erro?motivo=callback-falhou");
    }

    if (issued) {
      redirect("/nova-senha");
    }
  }

  redirect(resolveAuthCallbackPath({ code, next, exchangeFailed: false }));
}
