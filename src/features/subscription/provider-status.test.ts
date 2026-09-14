import { describe, expect, it } from "vitest";

import {
  isActiveProviderSubscription,
  mapPaymentStatusToLocal,
  mapPreapprovalStatusToLocal,
  shouldCreateOrRenewPaidPeriod,
} from "@/features/subscription/provider-status";

describe("mapPreapprovalStatusToLocal", () => {
  it("authorized NÃO concede acesso pago", () => {
    expect(mapPreapprovalStatusToLocal("authorized")).toEqual({
      localStatus: null,
      grantsAccess: false,
    });
    expect(isActiveProviderSubscription("authorized")).toBe(true);
  });

  it("pending não libera acesso", () => {
    expect(mapPreapprovalStatusToLocal("pending").grantsAccess).toBe(false);
  });

  it("paused → past_due", () => {
    expect(mapPreapprovalStatusToLocal("paused").localStatus).toBe("past_due");
  });

  it("canceled → cancelled", () => {
    expect(mapPreapprovalStatusToLocal("canceled").localStatus).toBe("cancelled");
  });

  it("desconhecido não libera acesso", () => {
    expect(mapPreapprovalStatusToLocal("unknown").grantsAccess).toBe(false);
  });
});

describe("mapPaymentStatusToLocal", () => {
  it("approved → active", () => {
    expect(mapPaymentStatusToLocal("approved").localStatus).toBe("active");
  });

  it("pending não altera para active", () => {
    expect(mapPaymentStatusToLocal("pending").localStatus).toBeNull();
  });

  it("authorized no payment NÃO ativa (só approved)", () => {
    expect(mapPaymentStatusToLocal("authorized")).toEqual({
      localStatus: null,
      grantsAccess: false,
    });
  });

  it("refunded e charged_back → past_due", () => {
    expect(mapPaymentStatusToLocal("refunded").localStatus).toBe("past_due");
    expect(mapPaymentStatusToLocal("charged_back").localStatus).toBe("past_due");
  });
});

describe("shouldCreateOrRenewPaidPeriod", () => {
  it("exige GET do payment e status approved", () => {
    expect(
      shouldCreateOrRenewPaidPeriod({
        verifiedPaymentFetched: true,
        paymentStatus: "approved",
      }),
    ).toBe(true);
  });

  it("envelope authorized_payment sem GET não cria período pago", () => {
    expect(
      shouldCreateOrRenewPaidPeriod({
        verifiedPaymentFetched: false,
        paymentStatus: "approved",
      }),
    ).toBe(false);
  });

  it("payment authorized não cria período pago", () => {
    expect(
      shouldCreateOrRenewPaidPeriod({
        verifiedPaymentFetched: true,
        paymentStatus: "authorized",
      }),
    ).toBe(false);
  });
});
