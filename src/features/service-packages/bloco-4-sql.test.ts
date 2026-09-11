import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = "supabase/migrations/20260911200000_customer_service_packages_payment_idempotency.sql";

describe("BLOCO 4 — superfície SQL de pacotes", () => {
  const migration = readFileSync(join(process.cwd(), MIGRATION), "utf8");

  it("não reaplica blocos anteriores", () => {
    expect(migration).not.toContain("20260911120000_authorization_rls_tenant_isolation");
    expect(migration).not.toContain("20260911153000_agenda_civil_date_working_hours_recurrence");
    expect(migration).not.toContain("20260911180000_service_order_state_machine_concurrency");
  });

  it("venda exige idempotency_key única por empresa", () => {
    expect(migration).toContain("idempotency_key");
    expect(migration).toContain("customer_service_packages_company_idempotency_key");
    expect(migration).toContain("UNIQUE (company_id, idempotency_key)");
    expect(migration).toContain("p_idempotency_key");
    expect(migration).toContain("invalid_idempotency_key");
  });

  it("pending não é crédito: consumo exige financial paid", () => {
    expect(migration).toContain("package_payment_pending");
    expect(migration).toContain("private.customer_package_financial_status");
    expect(migration).toContain("v_financial_status IS DISTINCT FROM 'paid'");
  });

  it("pending → paid atualiza o mesmo pacote via mark_financial_entry_paid", () => {
    expect(migration).toContain("private.mark_financial_entry_paid");
    expect(migration).toContain("source_type = 'service_package'");
    expect(migration).toContain("refresh_customer_service_package_status");
    expect(migration).toContain("package_price_mismatch");
  });

  it("consumo é idempotente por appointment e não permite saldo negativo", () => {
    expect(migration).toContain("customer_service_package_usages_appointment_consumed_uidx");
    expect(migration).toContain("quantity_used < quantity_total");
    expect(migration).toContain("WHEN unique_violation THEN");
    expect(migration).toContain("FOR UPDATE");
  });

  it("devolução no cancelamento de appointment não decrementa abaixo de zero", () => {
    expect(migration).toContain("private.reverse_package_usage_for_appointment");
    expect(migration).toContain("AND quantity_used > 0");
  });

  it("cancelamento pending reconcilia financeiro; paid bloqueia sem refund", () => {
    expect(migration).toContain("package_paid_requires_refund");
    expect(migration).toContain("package_has_usages");
    expect(migration).toContain("status = 'cancelled'");
  });

  it("expiração usa data civil da empresa, não new Date() do app", () => {
    expect(migration).toContain("private.company_civil_today");
    expect(migration).toContain("companies.timezone");
    expect(migration).toContain("expires_at < v_today");
    expect(migration).toContain("INCLUSIVO");
  });

  it("preço da venda vem do catálogo server-side e deve ser > 0", () => {
    expect(migration).toContain("v_package.price_cents");
    expect(migration).toContain("v_package.price_cents <= 0");
    expect(migration).not.toContain("p_price_cents");
    expect(migration).not.toContain("p_amount_cents");
  });

  it("wrapper público preserva tenant e permissão do BLOCO 1", () => {
    expect(migration).toContain("private.activate_company_context");
    expect(migration).toContain("private.require_app_permission");
    expect(migration).toContain("finance.create");
    expect(migration).toContain("p_company_id");
  });
});

describe("BLOCO 4 — actions e formulário de venda", () => {
  it("Server Action envia chave de idempotência e company_id do contexto", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/service-packages/actions.ts"),
      "utf8",
    );

    expect(source).toContain("requirePermission");
    expect(source).toContain("p_idempotency_key");
    expect(source).toContain("p_company_id: context.membership.company.id");
    expect(source).not.toMatch(/formData\.get\(["']priceCents["']\)/);
    expect(source).not.toMatch(/formData\.get\(["']amount_cents["']\)/);
  });

  it("formulário gera a chave uma vez por montagem (duplo clique / retry)", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/service-packages/components/sell-package-form.tsx"),
      "utf8",
    );

    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain('name="idempotencyKey"');
  });
});
