import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { formatUtcDateInTimezone } from "@/lib/timezone";

const ORIGINAL = "supabase/migrations/20260911300000_pdv_server_side_price_checkout.sql";
const HARDENING = "supabase/migrations/20260911320000_stock_expiration_company_civil_today.sql";
const DUE_DATE = "supabase/migrations/20260911340000_pdv_due_date_company_civil_today.sql";
const BLOCO4 = "supabase/migrations/20260911200000_customer_service_packages_payment_idempotency.sql";

const INSTANT_UTC_NEXT_CIVIL_SP = "2026-09-12T02:00:00.000Z";
const INSTANT_TOKYO_NEXT_CIVIL = "2026-09-11T16:00:00.000Z";

function extractFunction(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION ${name}(`;
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = sql.slice(start);
  const end = rest.indexOf("\n$$;");
  expect(end).toBeGreaterThan(0);
  return rest.slice(0, end);
}

function saleDueDate(instantIso: string, companyTimeZone: string): string {
  return formatUtcDateInTimezone(instantIso, companyTimeZone);
}

describe("BLOCO 6 hardening — due_date civil da venda PDV", () => {
  const original = readFileSync(join(process.cwd(), ORIGINAL), "utf8");
  const hardening = readFileSync(join(process.cwd(), HARDENING), "utf8");
  const migration = readFileSync(join(process.cwd(), DUE_DATE), "utf8");
  const bloco4 = readFileSync(join(process.cwd(), BLOCO4), "utf8");
  const completeSale = extractFunction(migration, "private.complete_product_sale");

  it("não edita migrations anteriores do BLOCO 6", () => {
    expect(original).toContain("v_total, CURRENT_DATE, v_user_id");
    expect(hardening).toContain("v_total, CURRENT_DATE, v_user_id");
    expect(hardening).toContain("due_date do financial_entry permanece CURRENT_DATE");
    expect(migration).not.toContain("20260911300000_pdv_server_side_price_checkout");
    expect(migration).not.toContain("20260911320000_stock_expiration_company_civil_today");
  });

  it("reutiliza private.company_civil_today sem criar helper concorrente", () => {
    expect(bloco4).toContain("CREATE OR REPLACE FUNCTION private.company_civil_today(p_company_id uuid)");
    expect(completeSale).toContain("private.company_civil_today(v_company_id)");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION private.company_civil_today");
    expect(migration).not.toContain("CREATE FUNCTION private.company_civil_today");
  });

  it("complete_product_sale não usa CURRENT_DATE para due_date", () => {
    expect(completeSale).toContain("INSERT INTO public.financial_entries");
    expect(completeSale).toContain("due_date");
    expect(completeSale).toContain(
      "v_description, 'Produtos', v_total, private.company_civil_today(v_company_id), v_user_id",
    );
    expect(completeSale).not.toContain("CURRENT_DATE");
    expect(completeSale).not.toMatch(/due_date[\s\S]{0,220}CURRENT_DATE/);
  });

  it("sold_at e paid_at continuam timestamptz; só due_date é data civil", () => {
    expect(completeSale).toContain("sold_at, idempotency_key");
    expect(completeSale).toContain("v_fingerprint, now(), p_idempotency_key");
    expect(completeSale).toMatch(/paid_at, idempotency_key, created_by/);
    expect(completeSale).toMatch(/v_pay->>'payment_method', now\(\), v_pay_key/);
    expect(completeSale).toContain("'cash', now(), v_pay_key, v_user_id");
  });

  it("preserva checkout atômico, idempotência, estoque e pagamentos mistos", () => {
    expect(completeSale).toContain("v_unit_price := v_product.sale_price_cents");
    expect(completeSale).toContain("checkout_fingerprint");
    expect(completeSale).toContain("idempotency_key_conflict");
    expect(completeSale).toContain("WHEN unique_violation THEN");
    expect(completeSale).toContain("expiration_date < private.company_civil_today(v_company_id)");
    expect(completeSale).toContain("private.register_stock_movement");
    expect(completeSale).toContain("INSERT INTO public.financial_payments");
    expect(completeSale).toContain("v_applied_cash := least(");
    expect(completeSale).toContain("cash_session_required");
    expect(completeSale).toContain("private.sync_financial_entry_payment_status");
    expect(completeSale).not.toMatch(/DELETE FROM public\.sales/i);
    expect(completeSale).not.toContain("DROP TABLE");
  });

  it("não inicia BLOCO 7 nem reabre migrations 1–5", () => {
    expect(migration).toContain("Não inicia BLOCO 7");
    expect(migration).not.toContain("20260911120000_authorization_rls_tenant_isolation");
    expect(migration).not.toContain("20260911153000_agenda_civil_date_working_hours_recurrence");
    expect(migration).not.toContain("20260911180000_service_order_state_machine_concurrency");
    expect(migration).not.toContain("20260911200000_customer_service_packages_payment_idempotency");
    expect(migration).not.toContain("20260911220000_financial_payments_source_of_truth");
  });
});

describe("BLOCO 6 hardening — timezone do due_date da venda", () => {
  it("America/Sao_Paulo: 2026-09-12T02:00:00Z ainda é 11/09 civil", () => {
    const timeZone = "America/Sao_Paulo";
    const civilToday = formatUtcDateInTimezone(INSTANT_UTC_NEXT_CIVIL_SP, timeZone);
    const dueDate = saleDueDate(INSTANT_UTC_NEXT_CIVIL_SP, timeZone);

    expect(civilToday).toBe("2026-09-11");
    expect(dueDate).toBe("2026-09-11");
    expect(formatUtcDateInTimezone(INSTANT_UTC_NEXT_CIVIL_SP, "UTC")).toBe("2026-09-12");
  });

  it("UTC: due_date corresponde ao dia UTC do instante", () => {
    const civilToday = formatUtcDateInTimezone(INSTANT_UTC_NEXT_CIVIL_SP, "UTC");
    const dueDate = saleDueDate(INSTANT_UTC_NEXT_CIVIL_SP, "UTC");

    expect(civilToday).toBe("2026-09-12");
    expect(dueDate).toBe("2026-09-12");
    expect(dueDate).toBe(civilToday);
  });

  it("Asia/Tokyo: due_date segue o dia civil da empresa, não UTC", () => {
    const tokyo = formatUtcDateInTimezone(INSTANT_TOKYO_NEXT_CIVIL, "Asia/Tokyo");
    const utc = formatUtcDateInTimezone(INSTANT_TOKYO_NEXT_CIVIL, "UTC");
    const dueDate = saleDueDate(INSTANT_TOKYO_NEXT_CIVIL, "Asia/Tokyo");

    expect(tokyo).toBe("2026-09-12");
    expect(utc).toBe("2026-09-11");
    expect(dueDate).toBe("2026-09-12");
    expect(dueDate).toBe(tokyo);
    expect(dueDate).not.toBe(utc);
  });
});
