import { describe, expect, it } from "vitest";

import {
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

  it("monta preapproval pending sem free_trial e sem card_token", () => {
    const payload = buildCreatePendingPreapprovalPayload({
      companyId,
      payerEmail: "tutor@example.com",
      backUrl: "http://localhost:3000/assinatura/retorno",
    });

    expect(payload.status).toBe("pending");
    expect(payload.auto_recurring.transaction_amount).toBe(89.9);
    expect(payload.auto_recurring.currency_id).toBe("BRL");
    expect(payload.auto_recurring.frequency).toBe(1);
    expect(payload.auto_recurring.frequency_type).toBe("months");
    expect("free_trial" in payload.auto_recurring).toBe(false);
    expect("card_token_id" in payload).toBe(false);
  });

  it("preço mensal = 8990 centavos", () => {
    expect(getMercadoPagoTransactionAmount()).toBe(89.9);
    expect(getMercadoPagoTransactionAmount() * 100).toBe(8990);
  });
});
