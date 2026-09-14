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
    expect(envExample).toContain("MERCADO_PAGO_ACCESS_TOKEN=");
    expect(envExample).toContain("MERCADO_PAGO_WEBHOOK_SECRET=");
    expect(envExample).not.toMatch(/NEXT_PUBLIC_MERCADO_PAGO/);
    expect(envExample).toContain("BILLING_DEV_BYPASS=false");
  });

  it("billing_payments e webhook events não têm policy de escrita para authenticated", () => {
    const trialSql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260806083000_subscriptions_trial.sql"),
      "utf8",
    );
    const mpSql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260806084500_mercado_pago_billing.sql"),
      "utf8",
    );
    const bloco9 = readFileSync(
      join(process.cwd(), "supabase/migrations/20260914150000_bloco9_billing_payments_webhook.sql"),
      "utf8",
    );
    expect(trialSql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(trialSql).toContain("company_subscriptions_select");
    expect(trialSql).toContain("sem mutações pelo browser");
    expect(mpSql).toContain("Sem policies para authenticated");
    expect(bloco9).toContain("ENABLE ROW LEVEL SECURITY");
    expect(bloco9).not.toMatch(/CREATE POLICY[\s\S]*billing_payments/i);
  });
});
