import { NextResponse } from "next/server";

import { requireCompanyContext } from "@/lib/auth/require-company-context";

/**
 * Contexto de segurança do tenant atual — apenas development.
 * Não expõe tokens, cookies, PII ou dados de negócio.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const context = await requireCompanyContext();

    return NextResponse.json({
      authenticated: true,
      userId: context.user.id,
      companyId: context.membership.company.id,
      companyName: context.membership.company.name,
    });
  } catch {
    return NextResponse.json({
      authenticated: false,
      userId: null,
      companyId: null,
      companyName: null,
    });
  }
}
