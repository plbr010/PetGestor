import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = "supabase/migrations/20260912090000_bloco8_rate_limit_policy_server_side.sql";
const MERGED_MIGRATION = "supabase/migrations/20260911400000_bloco8_auth_onboarding_rate_limit.sql";

function loadSql() {
  return readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf8");
}

describe("migration 20260912090000 — política de rate limit no banco", () => {
  it("é incremental e não edita a migration mergeada 20260911400000", () => {
    const merged = readFileSync(resolve(process.cwd(), MERGED_MIGRATION), "utf8");
    expect(merged).toContain("CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit");
    expect(MIGRATION_PATH).toContain("20260912090000");
    expect(MIGRATION_PATH).not.toContain("20260911400000");
  });

  it("J — revoga e remove a assinatura antiga vulnerável", () => {
    const sql = loadSql().toLowerCase();
    expect(sql).toContain(
      "revoke all on function public.consume_auth_rate_limit(text, integer, integer, timestamptz)",
    );
    expect(sql).toContain(
      "drop function if exists public.consume_auth_rate_limit(text, integer, integer, timestamptz)",
    );
  });

  it("A/B/C — API pública não aceita limit, window nem now do caller", () => {
    const sql = loadSql();
    expect(sql).toMatch(
      /create or replace function public\.consume_auth_rate_limit\(\s*p_action text,\s*p_bucket_key text\s*\)/i,
    );
    expect(sql).not.toMatch(/\bp_limit\b/i);
    expect(sql).not.toMatch(/\bp_window_seconds\b/i);
    expect(sql).not.toMatch(/\bp_now\b/i);
  });

  it("política vive em private.auth_rate_limit_policy e o relógio é now()", () => {
    const sql = loadSql();
    expect(sql).toMatch(/create or replace function private\.auth_rate_limit_policy\(p_action text\)/i);
    expect(sql).toMatch(/v_now\s*:=\s*now\(\)/i);
    expect(sql).toMatch(/when 'login' then/i);
    expect(sql).toMatch(/when 'signup' then/i);
    expect(sql).toMatch(/when 'recovery' then/i);
    expect(sql).toMatch(/when 'resend_confirmation' then/i);
    expect(sql).toMatch(/when 'invite' then/i);
    expect(sql).toMatch(/when 'invite_lookup' then/i);
    expect(sql).toMatch(/raise exception 'invalid_rate_limit_action'/i);
  });

  it("D — action desconhecida falha", () => {
    const sql = loadSql();
    expect(sql).toMatch(/else/i);
    expect(sql).toContain("invalid_rate_limit_action");
  });

  it("E/F/G — login/signup/recovery têm limites internos", () => {
    const sql = loadSql();
    expect(sql).toMatch(/when 'login' then[\s\S]*?hit_limit := 8/i);
    expect(sql).toMatch(/when 'signup' then[\s\S]*?hit_limit := 5/i);
    expect(sql).toMatch(/when 'recovery' then[\s\S]*?hit_limit := 5/i);
  });

  it("H — concorrência continua atômica (lock + upsert)", () => {
    const sql = loadSql();
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(/insert into private\.auth_rate_limit_buckets/i);
    expect(sql).toMatch(/on conflict \(bucket_key\) do update/i);
  });

  it("não reseta a tabela nem desabilita RLS", () => {
    const sql = loadSql();
    expect(sql).not.toMatch(/truncate\s+private\.auth_rate_limit_buckets/i);
    expect(sql).not.toMatch(/drop table\s+private\.auth_rate_limit_buckets/i);
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it("GRANT só na assinatura nova de 2 argumentos", () => {
    const sql = loadSql().toLowerCase();
    expect(sql).toContain(
      "grant execute on function public.consume_auth_rate_limit(text, text) to anon, authenticated",
    );
    expect(sql).not.toContain(
      "grant execute on function public.consume_auth_rate_limit(text, integer, integer, timestamptz)",
    );
  });
});
