"use server";

import { runGlobalSearch } from "@/features/global-search/search";
import type { GlobalSearchResult } from "@/features/global-search/types";
import { GLOBAL_SEARCH_MIN_CHARS } from "@/features/global-search/types";
import { prepareSearchQuery } from "@/features/global-search/normalize";
import { requirePermission } from "@/lib/auth/require-permission";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GlobalSearchActionResult =
  | { ok: true; data: GlobalSearchResult }
  | { ok: false; error: string };

export async function globalSearchAction(query: string): Promise<GlobalSearchActionResult> {
  const prepared = prepareSearchQuery(query);

  if (prepared.term.length < GLOBAL_SEARCH_MIN_CHARS) {
    return { ok: true, data: { query: prepared.term, groups: [] } };
  }

  try {
    const context = await requirePermission("dashboard.view");
    const supabase = await createSupabaseServerClient();

    const data = await runGlobalSearch({
      supabase,
      companyId: context.membership.company.id,
      membership: context.membership,
      query: prepared.term,
    });

    return { ok: true, data };
  } catch {
    return { ok: false, error: "Não foi possível realizar a busca agora." };
  }
}
