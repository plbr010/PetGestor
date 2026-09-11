import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260911300000_pdv_server_side_price_checkout.sql";
const BLOCO5 = "supabase/migrations/20260911220000_financial_payments_source_of_truth.sql";
const BLOCO4 = "supabase/migrations/20260911200000_customer_service_packages_payment_idempotency.sql";
const BLOCO3 = "supabase/migrations/20260911180000_service_order_state_machine_concurrency.sql";

describe("BLOCO 6 — superfície SQL do PDV", () => {
  const migration = readFileSync(join(process.cwd(), MIGRATION), "utf8");

  it("não reaplica blocos anteriores", () => {
    expect(migration).not.toContain("20260911120000_authorization_rls_tenant_isolation");
    expect(migration).not.toContain("20260911153000_agenda_civil_date_working_hours_recurrence");
    expect(migration).not.toContain("20260911180000_service_order_state_machine_concurrency");
    expect(migration).not.toContain("20260911200000_customer_service_packages_payment_idempotency");
    expect(migration).not.toContain("20260911220000_financial_payments_source_of_truth");
    expect(migration).not.toContain("20260911230000_create_manual_financial_entry_atomic");
  });

  it("não apaga vendas/estoque/pagamentos nem desabilita RLS", () => {
    expect(migration).not.toMatch(/DELETE FROM public\.sales/i);
    expect(migration).not.toMatch(/DELETE FROM public\.sale_items/i);
    expect(migration).not.toMatch(/DELETE FROM public\.financial_payments/i);
    expect(migration).not.toMatch(/DELETE FROM public\.stock_movements/i);
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it("preço oficial vem do catálogo e ignora o cliente", () => {
    expect(migration).toContain("v_unit_price := v_product.sale_price_cents");
    expect(migration).not.toContain("v_item->>'unit_price_cents'");
    expect(migration).not.toContain("v_item->>'price_cents'");
    expect(migration).toContain("invalid_price_cents");
    expect(migration).toContain("sale_total_zero");
  });

  it("checkout é atômico com lock, fingerprint e unique_violation", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("checkout_fingerprint");
    expect(migration).toContain("idempotency_key_conflict");
    expect(migration).toContain("WHEN unique_violation THEN");
    expect(migration).toContain("INSERT INTO public.sales");
    expect(migration).toContain("INSERT INTO public.sale_items");
    expect(migration).toContain("INSERT INTO public.financial_entries");
    expect(migration).toContain("INSERT INTO public.financial_payments");
    expect(migration).toContain("private.register_stock_movement");
  });

  it("estoque usa UPDATE WHERE current_stock e nunca negativo", () => {
    expect(migration).toContain("AND current_stock = v_previous");
    expect(migration).toContain("AND v_new >= 0");
    expect(migration).toContain("RETURNING id INTO v_updated");
    expect(migration).toContain("insufficient_stock");
    expect(migration).toContain("negative_stock");
    expect(migration).toContain("FOR UPDATE");
  });

  it("cash_received é separado do payment e o troco não é receita", () => {
    expect(migration).toContain("cash_received_cents");
    expect(migration).toContain("v_applied_cash := least(");
    expect(migration).toContain("v_change := greatest(0, v_cash_received - v_applied_cash)");
    expect(migration).toContain("Não é receita");
  });

  it("caixa aberto é validado no servidor para dinheiro", () => {
    expect(migration).toContain("cash_session_required");
    expect(migration).toContain("cash_session_id");
    expect(migration).toContain("status = 'open'");
  });

  it("cancelamento de venda paga exige refund e não apaga histórico", () => {
    expect(migration).toContain("sale_paid_requires_refund");
    expect(migration).not.toMatch(/DELETE FROM public\.sales/);
  });

  it("cross-tenant usa not_found genérico", () => {
    expect(migration).toContain("RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'");
  });

  it("fonte canônica financeira permanece SUM(financial_payments)", () => {
    expect(migration).toContain("private.sum_active_financial_payments");
    expect(migration).toContain("private.sync_financial_entry_payment_status");
  });
});

describe("BLOCO 6 — actions do PDV", () => {
  it("completeSaleAction não trata unit_price como autoridade", () => {
    const source = readFileSync(join(process.cwd(), "src/features/pos/actions.ts"), "utf8");
    expect(source).toContain("requirePermission");
    expect(source).toContain("p_company_id: context.membership.company.id");
    expect(source).toContain("p_idempotency_key");
    expect(source).toContain("buildRpcItemsPayload(parsed.data.items)");
    expect(source).not.toMatch(/unitPriceCents: item\.unitPriceCents/);
  });

  it("payload RPC de itens não envia preço autoritativo", () => {
    const source = readFileSync(join(process.cwd(), "src/features/pos/cart-engine.ts"), "utf8");
    expect(source).toContain("product_id: line.productId");
    expect(source).toContain("quantity: roundQuantity(line.quantity)");
    expect(source).not.toContain("unit_price_cents: line.unitPriceCents");
  });
});

describe("BLOCO 6 — regressão financeira dos blocos 3–5", () => {
  it("hardening BLOCO 5 permanece: manual paid atômico e parciais", () => {
    const bloco5 = readFileSync(join(process.cwd(), BLOCO5), "utf8");
    expect(bloco5).toContain("ensure_manual_paid_has_payment");
    expect(bloco5).toContain("private.register_financial_payment");
    expect(bloco5).toContain("payment_exceeds_balance");
    expect(bloco5).toContain("sale_entry_not_cancellable");
  });

  it("BLOCO 4 pending → paid permanece", () => {
    const bloco4 = readFileSync(join(process.cwd(), BLOCO4), "utf8");
    expect(bloco4).toContain("refresh_customer_service_package_status");
    expect(bloco4).toContain("package_price_mismatch");
  });

  it("BLOCO 3 receita de OS idempotente permanece", () => {
    const bloco3 = readFileSync(join(process.cwd(), BLOCO3), "utf8");
    expect(bloco3).toContain("ON CONFLICT (appointment_id)");
    expect(bloco3).toContain("UPDATE");
  });
});
