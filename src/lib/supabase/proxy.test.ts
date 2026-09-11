import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PATHNAME_HEADER, buildRequestHeadersWithPathname } from "@/lib/supabase/proxy";

describe("supabase proxy pathname forwarding", () => {
  it("propaga x-pathname nos headers da REQUEST, não só da response", () => {
    const request = {
      headers: new Headers({ cookie: "sb=1" }),
      nextUrl: { pathname: "/dashboard/financeiro" },
    };

    const forwarded = buildRequestHeadersWithPathname(request as never);

    expect(forwarded.get(PATHNAME_HEADER)).toBe("/dashboard/financeiro");
    expect(forwarded.get("cookie")).toBe("sb=1");
  });

  it("updateSession clona request headers ao recriar a response do refresh de cookies", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/supabase/proxy.ts"), "utf8");
    expect(source).toContain("NextResponse.next({");
    expect(source).toContain("request: {");
    expect(source).toContain("headers: requestHeaders");
    expect(source).toContain("supabaseResponse = nextWithPathname(request)");
    expect(source).not.toMatch(/supabaseResponse\.headers\.set\(PATHNAME_HEADER[\s\S]*return supabaseResponse;\s*$/);
  });
});
