import { describe, expect, it } from "vitest";

import {
  assertExpectedCheckoutAmount,
  buildCreatePendingPreapprovalPayload,
  buildExternalReference,
  getMercadoPagoTransactionAmount,
  parseExternalReference,
} from "@/features/subscription/providers/mercado-pago-types";

describe("Mercado Pago payload", () => {
  const companyId = "550e8400-e29b-41d4-a716-446655440000";

  it("usa external_reference determinística", () => {
    expect(buildExternalReference(companyId)).toBe(`petgestor_company_${companyId}`);
    expect(parseExternalReference(`petgestor_company_${companyId}`)).toBe(companyId);
  });

  it("monta preapproval mensal pending sem free_trial e sem card_token", () => {
    const payload = buildCreatePendingPreapprovalPayload({
      companyId,
      payerEmail: "tutor@example.com",
      backUrl: "http://localhost:3000/assinatura/retorno",
      billingInterval: "monthly",
    });

    expect(payload.status).toBe("pending");
    expect(payload.reason).toBe("PetGestor Mensal");
    expect(payload.auto_recurring.transaction_amount).toBe(89.9);
    expect(payload.auto_recurring.currency_id).toBe("BRL");
    expect(payload.auto_recurring.frequency).toBe(1);
    expect(payload.auto_recurring.frequency_type).toBe("months");
    expect("free_trial" in payload.auto_recurring).toBe(false);
    expect("card_token_id" in payload).toBe(false);
  });

  it("monta preapproval anual com frequency 12 e R$799", () => {
    const payload = buildCreatePendingPreapprovalPayload({
      companyId,
      payerEmail: "tutor@example.com",
      backUrl: "http://localhost:3000/assinatura/retorno",
      billingInterval: "annual",
    });

    expect(payload.reason).toBe("PetGestor Anual");
    expect(payload.auto_recurring.frequency).toBe(12);
    expect(payload.auto_recurring.frequency_type).toBe("months");
    expect(payload.auto_recurring.transaction_amount).toBe(799);
    expect(payload.auto_recurring.currency_id).toBe("BRL");
  });

  it("preço mensal = 8990 centavos e anual = 79900", () => {
    expect(getMercadoPagoTransactionAmount("monthly")).toBe(89.9);
    expect(getMercadoPagoTransactionAmount("monthly") * 100).toBe(8990);
    expect(getMercadoPagoTransactionAmount("annual")).toBe(799);
    expect(getMercadoPagoTransactionAmount("annual") * 100).toBe(79900);
  });

  it("rejeita valor de checkout diferente do plano server-side", () => {
    expect(() => assertExpectedCheckoutAmount("monthly", 1)).toThrow("billing_amount_mismatch");
    expect(() => assertExpectedCheckoutAmount("annual", 89.9)).toThrow("billing_amount_mismatch");
    expect(() => assertExpectedCheckoutAmount("annual", 799)).not.toThrow();
  });
});
