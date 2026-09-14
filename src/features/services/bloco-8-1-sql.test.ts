import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION =
  "supabase/migrations/20260914172942_bloco81_service_prices_recipe_atomic.sql";

describe("BLOCO 8.1 — superfície SQL atômica", () => {
  const migration = readFileSync(join(process.cwd(), MIGRATION), "utf8");

  it("não edita migrations anteriores nem inicia BLOCO 10", () => {
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.complete_onboarding");
    expect(migration).not.toContain("mapPreapprovalStatusToLocal");
    expect(migration).not.toContain("create_appointment");
    expect(migration).not.toContain("complete_product_sale");
  });

  it("CREATE e UPDATE aplicam core, preços e ficha na mesma função", () => {
    expect(migration).toContain("private.create_service_with_prices_and_recipes");
    expect(migration).toContain("private.update_service_with_prices_and_recipes");
    expect(migration).toContain("private.create_service_with_prices(");
    expect(migration).toContain("private.update_service_with_prices(");
    expect(migration).toContain("private.replace_service_product_recipes(");
  });

  it("falha na ficha aborta a transação (função única + RAISE da ficha)", () => {
    const createFn = migration.slice(
      migration.indexOf("private.create_service_with_prices_and_recipes"),
      migration.indexOf("private.update_service_with_prices_and_recipes"),
    );
    expect(createFn).toContain("PERFORM private.replace_service_product_recipes");
    expect(createFn.indexOf("private.create_service_with_prices(")).toBeLessThan(
      createFn.indexOf("PERFORM private.replace_service_product_recipes"),
    );
  });

  it("UPDATE trava o serviço (FOR UPDATE + advisory lock)", () => {
    const updateFn = migration.slice(
      migration.indexOf("private.update_service_with_prices_and_recipes"),
    );
    expect(updateFn).toContain("FOR UPDATE");
    expect(updateFn).toContain("pg_advisory_xact_lock");
    expect(updateFn).toContain("s.company_id = v_company_id");
  });

  it("tenant explícito e permissão real services.manage", () => {
    expect(migration).toContain("private.activate_company_context(p_company_id)");
    expect(migration).toContain("private.require_app_permission(p_company_id, 'services.manage')");
    expect(migration).toContain("p_company_id uuid");
  });

  it("SECURITY DEFINER com search_path controlado e grants mínimos", () => {
    expect(migration).toContain("SET search_path = public, private, auth");
    expect(migration).toContain("REVOKE ALL ON TABLE private.service_mutation_attempts");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.create_service_with_prices");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.update_service_with_prices");
    expect(migration).not.toMatch(/GRANT ALL[\s\S]*authenticated/i);
    expect(migration).not.toContain("DISABLE ROW LEVEL SECURITY");
  });

  it("idempotência por empresa + operação + chave, com fingerprint", () => {
    expect(migration).toContain("PRIMARY KEY (company_id, operation, idempotency_key)");
    expect(migration).toContain("private.service_mutation_fingerprint");
    expect(migration).toContain("idempotency_key_conflict");
    expect(migration).toContain("ORDER BY item->>'product_id'");
    expect(migration).toContain("ORDER BY item->>'size'");
  });

  it("ficha vazia é lista vazia (limpa no UPDATE)", () => {
    expect(migration).toContain("p_items jsonb DEFAULT '[]'::jsonb");
    expect(migration).toContain("coalesce(p_items, '[]'::jsonb)");
  });
});

describe("BLOCO 8.1 — Server Action deixa de ser split", () => {
  const actions = readFileSync(
    join(process.cwd(), "src/features/services/actions.ts"),
    "utf8",
  );

  it("CREATE chama uma única RPC com preços e ficha", () => {
    const createFn = actions.slice(
      actions.indexOf("export async function createServiceAction"),
      actions.indexOf("export async function updateServiceAction"),
    );
    expect(createFn).toContain('rpc("create_service_with_prices"');
    expect(createFn).toContain("p_items:");
    expect(createFn).toContain("p_idempotency_key:");
    expect(createFn).not.toContain("replace_service_product_recipes");
    expect(createFn.match(/\.rpc\(/g)).toHaveLength(1);
  });

  it("UPDATE chama uma única RPC com preços e ficha", () => {
    const updateFn = actions.slice(
      actions.indexOf("export async function updateServiceAction"),
      actions.indexOf("export async function archiveServiceAction"),
    );
    expect(updateFn).toContain('rpc("update_service_with_prices"');
    expect(updateFn).toContain("p_items:");
    expect(updateFn).not.toContain("replace_service_product_recipes");
    expect(updateFn.match(/\.rpc\(/g)).toHaveLength(1);
  });

  it("formulário envia ficha e chave de idempotência", () => {
    const form = readFileSync(
      join(process.cwd(), "src/features/services/components/service-form.tsx"),
      "utf8",
    );
    expect(form).toContain("ServiceRecipeEditor");
    expect(form).toContain('name="idempotency_key"');
  });
});

describe("BLOCO 8.1 hardening — identidade do UPDATE", () => {
  const hardening = readFileSync(
    join(process.cwd(), "supabase/migrations/20260914174351_bloco81_idempotency_target_hardening.sql"),
    "utf8",
  );
  const original = readFileSync(
    join(process.cwd(), "supabase/migrations/20260914172942_bloco81_service_prices_recipe_atomic.sql"),
    "utf8",
  );

  it("não edita a migration mergeada do PR #72", () => {
    expect(hardening).not.toMatch(/^\s*DROP TABLE/m);
    expect(hardening).not.toMatch(/^\s*CREATE TABLE/m);
    expect(original).toContain("PRIMARY KEY (company_id, operation, idempotency_key)");
  });

  it("UPDATE exige service_id da tentativa igual ao alvo", () => {
    expect(hardening).toContain("p_expected_service_id");
    expect(hardening).toContain("v_existing.service_id IS DISTINCT FROM p_expected_service_id");
    expect(hardening).toContain("v_existing.service_id IS DISTINCT FROM p_service_id");
    expect(hardening).toContain("peek_service_mutation_attempt(");
    expect(hardening).toContain("p_service_id");
  });

  it("UPDATE serializa a key e o serviço até o commit", () => {
    expect(hardening).toContain(":service:update-key:");
    expect(hardening).toContain(":service:update:");
    expect(hardening).toContain("FOR UPDATE");
    expect(hardening).toContain("pg_advisory_xact_lock");
  });

  it("não desabilita RLS nem inicia BLOCO 10", () => {
    expect(hardening).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(hardening).not.toContain("mapPreapprovalStatusToLocal");
    expect(hardening).not.toContain("GRANT ALL");
  });
});
