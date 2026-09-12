import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260912120000_bloco8_recovery_onetime_rate_limit_service_role.sql";

function loadSql() {
  return readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf8");
}

describe("migration 20260912120000 — hardening final BLOCO 8", () => {
  it("é incremental e não edita migrations anteriores", () => {
    expect(MIGRATION_PATH).toContain("20260912120000");
    expect(MIGRATION_PATH).not.toContain("20260912090000");
    expect(MIGRATION_PATH).not.toContain("20260911400000");
  });

  it("revoga consume_auth_rate_limit de anon e authenticated", () => {
    const sql = loadSql().toLowerCase();
    expect(sql).toContain(
      "revoke all on function public.consume_auth_rate_limit(text, text) from anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.consume_auth_rate_limit(text, text) to service_role",
    );
  });

  it("não concede a primitive a anon/authenticated", () => {
    const sql = loadSql().toLowerCase();
    expect(sql).not.toContain(
      "grant execute on function public.consume_auth_rate_limit(text, text) to anon",
    );
    expect(sql).not.toContain(
      "grant execute on function public.consume_auth_rate_limit(text, text) to authenticated",
    );
  });

  it("limpa buckets antigos sem tocar janela ativa", () => {
    const sql = loadSql();
    expect(sql).toContain("cleanup_auth_rate_limit_buckets");
    expect(sql).toMatch(/updated_at < now\(\) - interval '2 hours'/i);
    expect(sql).not.toMatch(/truncate\s+private\.auth_rate_limit_buckets/i);
  });

  it("cria tabela privada de markers com hash, user_id, expiry e consumed_at", () => {
    const sql = loadSql();
    expect(sql).toContain("private.password_recovery_markers");
    expect(sql).toContain("token_hash");
    expect(sql).toContain("user_id");
    expect(sql).toContain("expires_at");
    expect(sql).toContain("consumed_at");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it("consumo one-time é atômico (UPDATE … consumed_at IS NULL … RETURNING)", () => {
    const sql = loadSql();
    expect(sql).toContain("consume_password_recovery_marker");
    expect(sql).toMatch(/SET consumed_at = now\(\)/i);
    expect(sql).toMatch(/consumed_at IS NULL/i);
    expect(sql).toMatch(/expires_at > now\(\)/i);
    expect(sql).toMatch(/RETURNING token_hash/i);
  });

  it("RPCs de recovery só para service_role", () => {
    const sql = loadSql().toLowerCase();
    expect(sql).toContain(
      "grant execute on function public.issue_password_recovery_marker(uuid, text, timestamptz) to service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.peek_password_recovery_marker(uuid, text) to service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.consume_password_recovery_marker(uuid, text) to service_role",
    );
    expect(sql).toContain(
      "revoke all on function public.consume_password_recovery_marker(uuid, text) from anon, authenticated",
    );
  });
});
