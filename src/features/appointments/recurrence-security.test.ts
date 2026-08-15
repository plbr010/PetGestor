import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("appointment recurrence security surface", () => {
  it("actions derivam company_id do contexto autenticado", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/appointments/actions.ts"),
      "utf8",
    );

    expect(source).toContain("requireCompanyContext");
    expect(source).toContain("context.membership.company.id");
    expect(source).not.toMatch(/formData\.get\(["']companyId["']\)/);
    expect(source).toContain('seriesScope === "this_and_following"');
    expect(source).toContain("expandRecurrenceStarts");
    expect(source).toContain("formatRecurrenceSkipSummary");
  });

  it("migration cria tabela tenant-scoped com RLS", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260815020000_appointment_recurrences.sql"),
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.appointment_recurrences");
    expect(migration).toContain("private.is_company_member(company_id)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS recurrence_id");
    expect(migration).toContain("max_occurrences <= 52");
  });

  it("cancelamento e edição suportam escopo this / this_and_following", () => {
    const form = readFileSync(
      join(process.cwd(), "src/features/appointments/components/appointment-form.tsx"),
      "utf8",
    );
    const statusActions = readFileSync(
      join(
        process.cwd(),
        "src/features/appointments/components/appointment-status-actions.tsx",
      ),
      "utf8",
    );

    expect(form).toContain("Repetir agendamento");
    expect(form).toContain("this_and_following");
    expect(statusActions).toContain("Este e os próximos");
  });
});
