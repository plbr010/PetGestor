import { NextResponse } from "next/server";

import { checkSupabaseConnection } from "@/lib/supabase/connection-check";

/**
 * Rota temporária de diagnóstico — disponível apenas em desenvolvimento.
 * Não expõe segredos nem dados privados.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await checkSupabaseConnection();

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
  });
}
