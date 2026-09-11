import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ORIGINAL = "supabase/migrations/20260911300000_pdv_server_side_price_checkout.sql";
const HARDENING = "supabase/migrations/20260911320000_stock_expiration_company_civil_today.sql";
const BLOCO4 = "supabase/migrations/20260911200000_customer_service_packages_payment_idempotency.sql";

describe("BLOCO 6 hardening — superfície SQL de validade civil", () => {
  const original = readFileSync(join(process.cwd(), ORIGINAL), "utf8");
  const hardening = readFileSync(join(process.cwd(), HARDENING), "utf8");
  const bloco4 = readFileSync(join(process.cwd(), BLOCO4), "utf8");

  it("não edita a migration original do BLOCO 6", () => {
    expect(original).toContain("AND expiration_date < CURRENT_DATE");
    expect(original).toContain("OR expiration_date IS NULL OR expiration_date >= CURRENT_DATE");
    expect(hardening).not.toContain("20260911300000_pdv_server_side_price_checkout");
  });

  it("reutiliza private.company_civil_today do BLOCO 4 sem criar regra concorrente", () => {
    expect(bloco4).toContain("CREATE OR REPLACE FUNCTION private.company_civil_today(p_company_id uuid)");
    expect(hardening).toContain("private.company_civil_today(v_company_id)");
    expect(hardening).not.toContain("CREATE OR REPLACE FUNCTION private.company_civil_today");
    expect(hardening).not.toContain("CREATE FUNCTION private.company_civil_today");
  });

  it("lote vencido usa hoje civil: expiration_date < today; igual a today permanece válido", () => {
    expect(hardening).toContain("expiration_date < private.company_civil_today(v_company_id)");
    expect(hardening).toContain("expiration_date >= private.company_civil_today(v_company_id)");
    expect(hardening).not.toMatch(/expiration_date\s*<\s*CURRENT_DATE/);
    expect(hardening).not.toMatch(/expiration_date\s*>=\s*CURRENT_DATE/);
    expect(hardening).toContain("ainda válido naquele dia civil");
  });

  it("corrige complete_product_sale e register_stock_movement sem resetar banco", () => {
    expect(hardening).toContain("CREATE OR REPLACE FUNCTION private.register_stock_movement");
    expect(hardening).toContain("CREATE OR REPLACE FUNCTION private.complete_product_sale");
    expect(hardening).not.toMatch(/DELETE FROM public\.sales/i);
    expect(hardening).not.toMatch(/DELETE FROM public\.product_batches/i);
    expect(hardening).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(hardening).not.toContain("DROP TABLE");
  });

  it("não inicia BLOCO 7 nem reabre migrations 1–5", () => {
    expect(hardening).toContain("Não inicia BLOCO 7");
    expect(hardening).not.toContain("20260911120000_authorization_rls_tenant_isolation");
    expect(hardening).not.toContain("20260911153000_agenda_civil_date_working_hours_recurrence");
    expect(hardening).not.toContain("20260911180000_service_order_state_machine_concurrency");
    expect(hardening).not.toContain("20260911200000_customer_service_packages_payment_idempotency");
    expect(hardening).not.toContain("20260911220000_financial_payments_source_of_truth");
  });
});

describe("BLOCO 6 hardening — queries e UI usam a mesma fonte de verdade", () => {
  it("período do PDV é half-open [start, endExclusive) com .lt, sem 23:59", () => {
    const source = readFileSync(join(process.cwd(), "src/features/pos/queries.ts"), "utf8");
    expect(source).toContain("getPosPeriodBounds");
    expect(source).toContain('.lt("sold_at"');
    expect(source).toContain('.lt("sales.sold_at"');
    expect(source).not.toContain("endOfLocalDayUtc");
    expect(source).not.toContain('"23:59"');
    expect(source).not.toMatch(/\.lte\("sold_at"/);
    expect(source).not.toMatch(/\.lte\("sales\.sold_at"/);
  });

  it("catálogo do PDV deriva canSell de availableStock, não de currentStock isolado", () => {
    const catalog = readFileSync(join(process.cwd(), "src/features/pos/catalog.ts"), "utf8");
    const workspace = readFileSync(
      join(process.cwd(), "src/features/pos/components/pos-workspace.tsx"),
      "utf8",
    );

    expect(catalog).toContain("getSellableStockAvailability");
    expect(catalog).toContain("computeAvailableStock");
    expect(workspace).toContain("product.canSell");
    expect(workspace).toContain("SELLABLE_STOCK_REASON_LABELS.expired");
    expect(workspace).not.toContain('product.stockStatus !== "out"');
  });
});
