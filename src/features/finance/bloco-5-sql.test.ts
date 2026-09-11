import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = "supabase/migrations/20260911220000_financial_payments_source_of_truth.sql";

describe("BLOCO 5 — superfície SQL financeira", () => {
  const migration = readFileSync(join(process.cwd(), MIGRATION), "utf8");

  it("não reaplica blocos anteriores", () => {
    expect(migration).not.toContain("20260911120000_authorization_rls_tenant_isolation");
    expect(migration).not.toContain("20260911153000_agenda_civil_date_working_hours_recurrence");
    expect(migration).not.toContain("20260911180000_service_order_state_machine_concurrency");
    expect(migration).not.toContain("20260911200000_customer_service_packages_payment_idempotency");
  });

  it("não apaga pagamentos nem desabilita RLS", () => {
    expect(migration).not.toMatch(/DELETE FROM public\.financial_payments/i);
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(migration).toContain("cancelled_at");
  });

  it("pagamento usa lock, teto e idempotência", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("payment_exceeds_balance");
    expect(migration).toContain("idempotency_key");
    expect(migration).toContain("WHEN unique_violation THEN");
    expect(migration).toContain("private.register_financial_payment");
  });

  it("pending → paid de pacote continua ativando o mesmo pacote", () => {
    expect(migration).toContain("source_type = 'service_package'");
    expect(migration).toContain("refresh_customer_service_package_status");
    expect(migration).toContain("package_price_mismatch");
  });

  it("reabertura manual cancela pagamentos; origens automáticas são bloqueadas", () => {
    expect(migration).toContain("service_order_entry_not_reopenable");
    expect(migration).toContain("package_entry_not_reopenable");
    expect(migration).toContain("sale_entry_not_reopenable");
    expect(migration).toContain("SET cancelled_at = now()");
  });

  it("cancelamento paid/partial exige refund e não apaga histórico", () => {
    expect(migration).toContain("financial_entry_has_payments_requires_refund");
    expect(migration).toContain("package_entry_not_cancellable");
    expect(migration).toContain("sale_entry_not_cancellable");
  });

  it("wrapper público preserva tenant e permissão do BLOCO 1", () => {
    expect(migration).toContain("private.activate_company_context");
    expect(migration).toContain("private.require_app_permission");
    expect(migration).toContain("finance.create");
    expect(migration).toContain("p_company_id");
  });

  it("novos manuais pagos geram financial_payment canônico", () => {
    expect(migration).toContain("ensure_manual_paid_has_payment");
    expect(migration).toContain("manual-entry:");
  });
});

describe("BLOCO 5 — actions e formulários", () => {
  it("mark paid envia amount, idempotency_key e company_id", () => {
    const source = readFileSync(join(process.cwd(), "src/features/finance/actions.ts"), "utf8");
    expect(source).toContain("requirePermission");
    expect(source).toContain("p_amount_cents");
    expect(source).toContain("p_idempotency_key");
    expect(source).toContain("p_company_id: context.membership.company.id");
  });

  it("formulário de pagamento gera chave uma vez por montagem", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/finance/components/mark-paid-form.tsx"),
      "utf8",
    );
    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain('name="idempotencyKey"');
    expect(source).toContain('name="amount"');
  });
});
