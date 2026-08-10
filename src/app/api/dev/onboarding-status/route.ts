import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getUserContext } from "@/features/companies/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Diagnóstico temporário de onboarding — apenas development.
 * Não expõe tokens, cookies ou credenciais.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      profileExists: false,
      membershipExists: false,
      companyReadable: false,
    });
  }

  const supabase = await createSupabaseServerClient();
  const context = await getUserContext(user.id);

  let companyReadable = false;

  if (context.membership) {
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("id", context.membership.company.id)
      .maybeSingle();

    companyReadable = Boolean(company);
  }

  return NextResponse.json({
    authenticated: true,
    profileExists: Boolean(context.profile),
    membershipExists: Boolean(context.membership),
    companyReadable,
  });
}
