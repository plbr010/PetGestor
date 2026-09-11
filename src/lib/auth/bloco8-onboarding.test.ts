import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260911400000_bloco8_auth_onboarding_hardening.sql",
);

describe("BLOCO 8 SQL — onboarding e rate limit", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("complete_onboarding usa advisory lock por auth.uid()", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("complete_onboarding:");
  });

  it("membership ativa retorna company_id existente", () => {
    expect(sql).toContain("AND cm.access_revoked_at IS NULL");
    expect(sql).toContain("ORDER BY cm.updated_at DESC NULLS LAST");
  });

  it("membership revogada não cria empresa nem ressuscita acesso", () => {
    expect(sql).toContain("onboarding_access_revoked");
    expect(sql).toContain("AND cm.access_revoked_at IS NOT NULL");
  });

  it("não infere tenant ativo só por created_at LIMIT 1", () => {
    const fn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.complete_onboarding("),
      sql.indexOf("REVOKE ALL ON FUNCTION public.complete_onboarding"),
    );
    expect(fn).not.toMatch(/ORDER BY[\s\S]*created_at[\s\S]*LIMIT 1/);
  });

  it("rate limit é UPSERT atômico com lock", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS private.sensitive_action_rate_limits");
    expect(sql).toContain("ON CONFLICT (bucket_hash) DO UPDATE");
    expect(sql).toContain("consume_sensitive_action_rate_limit");
    expect(sql).toContain("p_subject_hash !~ '^[a-f0-9]{64}$'");
  });

  it("não armazena e-mail em claro na tabela de rate limit", () => {
    expect(sql).not.toMatch(/sensitive_action_rate_limits[\s\S]*email text/);
  });
});
