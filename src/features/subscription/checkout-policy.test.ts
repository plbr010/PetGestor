import { describe, expect, it } from "vitest";

import {
  authorizeBillingMutation,
  buildCheckoutIdempotencyKey,
  parseCheckoutClientInput,
  parseCheckoutFormData,
  resolveCheckoutCompanyId,
  shouldReuseCheckoutIdempotencyKey,
} from "@/features/subscription/checkout-policy";

const COMPANY_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("parseCheckoutClientInput", () => {
  it("aceita monthly e annual", () => {
    expect(parseCheckoutClientInput({ plan: "monthly" }).ok && parseCheckoutClientInput({ plan: "monthly" }).ok).toBe(
      true,
    );
    const monthly = parseCheckoutClientInput({ plan: "monthly" });
    const annual = parseCheckoutClientInput({ plan: "annual" });
    expect(monthly.ok && monthly.value.billingInterval).toBe("monthly");
    expect(annual.ok && annual.value.billingInterval).toBe("annual");
  });

  it("rejeita plano inválido", () => {
    expect(parseCheckoutClientInput({ plan: "lifetime" }).ok).toBe(false);
    expect(parseCheckoutClientInput({ plan: "price=1" }).ok).toBe(false);
  });

  it("ignora amount e company_id enviados pelo browser", () => {
    const parsed = parseCheckoutClientInput({
      plan: "monthly",
      amount: 1,
      price: "0,01",
      company_id: COMPANY_B,
      companyId: COMPANY_B,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.billingInterval).toBe("monthly");
    expect(parsed.value.ignoredAmount).toBe(true);
    expect(parsed.value.ignoredCompanyId).toBe(true);
    expect(resolveCheckoutCompanyId(COMPANY_A)).toBe(COMPANY_A);
    expect(resolveCheckoutCompanyId(COMPANY_A)).not.toBe(COMPANY_B);
  });
});

describe("parseCheckoutFormData", () => {
  it("duplo clique e retry usam só o plano", () => {
    const formData = new FormData();
    formData.set("plan", "annual");
    formData.set("amount", "1");
    formData.set("company_id", COMPANY_B);
    const parsed = parseCheckoutFormData(formData);
    expect(parsed.ok && parsed.value.billingInterval).toBe("annual");
    expect(parsed.ok && parsed.value.ignoredAmount).toBe(true);
    expect(parsed.ok && parsed.value.ignoredCompanyId).toBe(true);
  });
});

describe("authorizeBillingMutation", () => {
  it("owner autenticado na própria empresa pode gerenciar", () => {
    expect(
      authorizeBillingMutation(
        {
          companyId: COMPANY_A,
          accessRevoked: false,
          canManageSubscription: true,
        },
        COMPANY_A,
      ),
    ).toEqual({ ok: true });
  });

  it("staff autorizado (subscription.manage) pode gerenciar", () => {
    expect(
      authorizeBillingMutation(
        {
          companyId: COMPANY_A,
          accessRevoked: false,
          canManageSubscription: true,
        },
        COMPANY_A,
      ).ok,
    ).toBe(true);
  });

  it("staff sem permissão é recusado", () => {
    expect(
      authorizeBillingMutation(
        {
          companyId: COMPANY_A,
          accessRevoked: false,
          canManageSubscription: false,
        },
        COMPANY_A,
      ),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("membership revogada é recusada", () => {
    expect(
      authorizeBillingMutation(
        {
          companyId: COMPANY_A,
          accessRevoked: true,
          canManageSubscription: true,
        },
        COMPANY_A,
      ),
    ).toEqual({ ok: false, reason: "revoked" });
  });

  it("Company A não age sobre Company B", () => {
    expect(
      authorizeBillingMutation(
        {
          companyId: COMPANY_A,
          accessRevoked: false,
          canManageSubscription: true,
        },
        COMPANY_B,
      ),
    ).toEqual({ ok: false, reason: "cross_tenant" });
  });
});

describe("checkout idempotency key", () => {
  it("duas requests simultâneas do mesmo plano compartilham a chave estável", () => {
    const first = buildCheckoutIdempotencyKey({
      companyId: COMPANY_A,
      billingInterval: "monthly",
    });
    const retry = buildCheckoutIdempotencyKey({
      companyId: COMPANY_A,
      billingInterval: "monthly",
    });
    expect(first).toBe(retry);
    expect(first).toContain(COMPANY_A);
    expect(first).toContain("monthly");
  });

  it("mensal e anual têm chaves distintas", () => {
    expect(
      buildCheckoutIdempotencyKey({ companyId: COMPANY_A, billingInterval: "monthly" }),
    ).not.toBe(
      buildCheckoutIdempotencyKey({ companyId: COMPANY_A, billingInterval: "annual" }),
    );
  });

  it("recria checkout pendente com chave distinta após substituir preapproval", () => {
    const original = buildCheckoutIdempotencyKey({
      companyId: COMPANY_A,
      billingInterval: "annual",
    });
    const replacement = buildCheckoutIdempotencyKey({
      companyId: COMPANY_A,
      billingInterval: "annual",
      replacingProviderSubscriptionId: "pre-old",
    });
    expect(replacement).not.toBe(original);
  });

  it("reusa chave local quando o pending ainda é válido", () => {
    expect(shouldReuseCheckoutIdempotencyKey("petgestor-checkout-key", true)).toBe(true);
    expect(shouldReuseCheckoutIdempotencyKey("petgestor-checkout-key", false)).toBe(false);
    expect(shouldReuseCheckoutIdempotencyKey(null, true)).toBe(false);
  });
});
