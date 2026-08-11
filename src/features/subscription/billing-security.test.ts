import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("billing security boundaries", () => {
  it("admin client é server-only", () => {
    const adminSource = readFileSync(
      join(process.cwd(), "src/lib/supabase/admin.ts"),
      "utf8",
    );
    expect(adminSource).toContain('import "server-only"');
  });

  it("Mercado Pago provider é server-only", () => {
    const mpSource = readFileSync(
      join(process.cwd(), "src/features/subscription/providers/mercado-pago.ts"),
      "utf8",
    );
    expect(mpSource).toContain('import "server-only"');
  });

  it("service role não aparece em NEXT_PUBLIC", () => {
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    expect(envExample).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(envExample).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });
});
