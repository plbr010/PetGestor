import { describe, expect, it } from "vitest";

import { resolvePaidPeriodOnApprovedPayment } from "@/features/subscription/sync-policy";

describe("resolvePaidPeriodOnApprovedPayment", () => {
  it("primeira ativação define período a partir do pagamento", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const result = resolvePaidPeriodOnApprovedPayment({
      billingInterval: "monthly",
      now,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextPaymentAt: "2026-10-01T12:00:00.000Z",
      alreadySubscribed: false,
    });
    expect(result.subscribed_at).toBe(now.toISOString());
    expect(result.current_period_start).toBe(now.toISOString());
    expect(result.current_period_end).toBe("2026-10-01T12:00:00.000Z");
  });

  it("pagamento antes do vencimento só avança o fim se next_payment for posterior", () => {
    const result = resolvePaidPeriodOnApprovedPayment({
      billingInterval: "monthly",
      now: new Date("2026-09-20T12:00:00.000Z"),
      currentPeriodStart: "2026-09-01T12:00:00.000Z",
      currentPeriodEnd: "2026-10-01T12:00:00.000Z",
      nextPaymentAt: "2026-11-01T12:00:00.000Z",
      alreadySubscribed: true,
    });
    expect(result.current_period_start).toBeUndefined();
    expect(result.current_period_end).toBe("2026-11-01T12:00:00.000Z");
  });

  it("pagamento no vencimento abre período novo", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const result = resolvePaidPeriodOnApprovedPayment({
      billingInterval: "monthly",
      now,
      currentPeriodStart: "2026-09-01T12:00:00.000Z",
      currentPeriodEnd: "2026-10-01T12:00:00.000Z",
      nextPaymentAt: "2026-11-01T12:00:00.000Z",
      alreadySubscribed: true,
    });
    expect(result.current_period_start).toBe(now.toISOString());
    expect(result.current_period_end).toBe("2026-11-01T12:00:00.000Z");
  });

  it("pagamento depois do vencimento não soma o período antigo", () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const result = resolvePaidPeriodOnApprovedPayment({
      billingInterval: "annual",
      now,
      currentPeriodStart: "2025-09-01T12:00:00.000Z",
      currentPeriodEnd: "2026-09-01T12:00:00.000Z",
      nextPaymentAt: null,
      alreadySubscribed: true,
    });
    expect(result.current_period_start).toBe(now.toISOString());
    expect(result.current_period_end).toBe("2027-10-10T12:00:00.000Z");
  });
});
