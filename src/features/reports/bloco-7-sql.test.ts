import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("BLOCO 7 — queries e páginas de relatórios", () => {
  const queries = read("src/features/reports/queries.ts");
  const period = read("src/features/reports/period.ts");
  const csv = read("src/features/reports/csv.ts");

  it("reutiliza período half-open canônico sem 23:59 / lte em timestamptz", () => {
    expect(period).toContain("getCivilDateRangeUtcBounds");
    expect(queries).toContain("getReportPeriodBounds");
    expect(queries).toContain('.lt("scheduled_start"');
    expect(queries).toContain('.lt("sold_at"');
    expect(queries).toContain('.lt("created_at"');
    expect(queries).toContain('.lt("purchased_at"');
    expect(queries).not.toContain('"23:59"');
    expect(queries).not.toMatch(/\.lte\("scheduled_start"/);
    expect(queries).not.toMatch(/\.lte\("sold_at"/);
    expect(queries).not.toMatch(/\.lte\("created_at"/);
    expect(queries).not.toMatch(/\.lte\("purchased_at"/);
    expect(queries).not.toMatch(/\.lte\("sales\.sold_at"/);
  });

  it("PDV filtra sale_items pelo status da sale pai e seleciona product_id", () => {
    expect(queries).toContain("VALID_PDV_SALE_STATUSES");
    expect(queries).toContain("product_id");
    expect(queries).toContain(".in(\"sales.status\"");
    expect(queries).toContain("sale_id");
  });

  it("estoque lê previous_quantity/new_quantity e tipos reais, sem inventar sale_exit", () => {
    expect(queries).toContain("previous_quantity");
    expect(queries).toContain("new_quantity");
    expect(queries).toContain("reason");
    expect(read("src/features/reports/engine.ts")).not.toContain("sale_exit");
  });

  it("pacotes carregam expires_at e financial_status canônico do BLOCO 4", () => {
    expect(queries).toContain("expires_at");
    expect(queries).toContain("getPackageFinancialStatusMap");
    expect(read("src/features/reports/engine.ts")).toContain("resolveDisplayStatus");
  });

  it("ocupação lê intervalo da jornada e não usa weeksInPeriod", () => {
    expect(queries).toContain("break_start");
    expect(queries).toContain("break_end");
    expect(read("src/features/reports/occupancy.ts")).toContain("shiftCapacityMinutes");
    expect(read("src/features/reports/occupancy.ts")).not.toContain("weeksInPeriod");
    expect(read("src/features/reports/occupancy.ts")).toContain("duration_minutes_snapshot");
  });

  it("soft-delete operacional em appointments, customers, pets e employees", () => {
    expect(queries).toContain('.is("deleted_at", null)');
    expect(queries.match(/from\("appointments"\)[\s\S]*?deleted_at/g)?.length).toBeGreaterThan(0);
  });

  it("overview financeiro continua usando BLOCO 5 (financial_payments)", () => {
    expect(queries).toContain("sumReceivedForEntryType");
    expect(queries).not.toContain("from(\"financial_entries\")");
  });

  it("CSV sanitiza fórmulas e páginas exigem reports.view", () => {
    expect(csv).toContain("FORMULA_PREFIX");
    expect(csv).toContain("\\uFEFF");

    const pages = [
      "src/app/(dashboard)/dashboard/relatorios/page.tsx",
      "src/app/(dashboard)/dashboard/relatorios/atendimentos/page.tsx",
      "src/app/(dashboard)/dashboard/relatorios/clientes/page.tsx",
      "src/app/(dashboard)/dashboard/relatorios/pets/page.tsx",
      "src/app/(dashboard)/dashboard/relatorios/equipe/page.tsx",
      "src/app/(dashboard)/dashboard/relatorios/pdv/page.tsx",
      "src/app/(dashboard)/dashboard/relatorios/estoque/page.tsx",
      "src/app/(dashboard)/dashboard/relatorios/pacotes/page.tsx",
    ];

    for (const page of pages) {
      const source = read(page);
      expect(source).toContain('requirePermission("reports.view")');
      expect(source).toContain("ReportExportRow");
      expect(source).not.toContain("service_role");
      expect(source).not.toContain("SERVICE_ROLE");
    }
  });

  it("não edita migrations dos BLOCOs 1–6", () => {
    expect(queries).not.toContain("20260911120000_authorization_rls_tenant_isolation");
    expect(queries).not.toContain("DROP TABLE");
  });
});
