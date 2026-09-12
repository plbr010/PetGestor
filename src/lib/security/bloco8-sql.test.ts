import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260911400000_bloco8_auth_onboarding_rate_limit.sql"),
  "utf8",
);

describe("BLOCO 8 SQL — onboarding atômico", () => {
  it("usa advisory lock por auth.uid", () => {
    expect(migration).toContain("pg_advisory_xact_lock(87112008, hashtext(v_user_id::text))");
  });

  it("retorna membership ativa existente sem criar outra empresa", () => {
    expect(migration).toContain("AND cm.access_revoked_at IS NULL");
    expect(migration).toContain("RETURN v_active_company_id");
  });

  it("não trata membership revogada como onboarding ativo", () => {
    expect(migration).toContain("RAISE EXCEPTION 'membership_revoked'");
    expect(migration).not.toMatch(/ORDER BY cm\.created_at ASC\s+LIMIT 1/);
  });

  it("não altera duração/plano do trial", () => {
    expect(migration).not.toContain("interval '72 hours'");
    expect(migration).not.toContain("interval '7 days'");
    expect(migration).toContain("private.create_company_subscription");
  });
});

describe("BLOCO 8 SQL — rate limit atômico", () => {
  it("persiste buckets no schema private com chave hash", () => {
    expect(migration).toContain("private.auth_rate_limit_buckets");
    expect(migration).toContain("nunca senha/e-mail em claro");
  });

  it("consome com lock + UPSERT", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit");
    expect(migration).toContain("pg_advisory_xact_lock(87112009, hashtext(p_bucket_key))");
    expect(migration).toContain("ON CONFLICT (bucket_key) DO UPDATE");
  });
});
