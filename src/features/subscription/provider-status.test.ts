import { describe, expect, it } from "vitest";

import {
  mapPaymentStatusToLocal,
  mapPreapprovalStatusToLocal,
} from "@/features/subscription/provider-status";

describe("mapPreapprovalStatusToLocal", () => {
  it("authorized → active", () => {
    expect(mapPreapprovalStatusToLocal("authorized")).toEqual({
      localStatus: "active",
      grantsAccess: true,
    });
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

  it("rejected → past_due", () => {
    expect(mapPaymentStatusToLocal("rejected").localStatus).toBe("past_due");
  });
});
