import { describe, expect, it } from "vitest";

import {
  buildWebhookProviderEventId,
  decideWebhookReplay,
  interpretUniqueViolation,
  pickLatestPayment,
  resolveWebhookDataId,
  resolveWebhookTenant,
  shouldApplyLocalStatusTransition,
  shouldApplyProviderSnapshot,
} from "@/features/subscription/webhook-policy";

const COMPANY_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("resolveWebhookTenant", () => {
  it("exige registro local pelo provider id", () => {
    expect(
      resolveWebhookTenant({
        localCompanyIdByProviderId: null,
        externalReferenceCompanyId: COMPANY_B,
      }),
    ).toEqual({ ok: false, reason: "missing_local_record" });
  });

  it("external_reference adulterada para B não ativa B", () => {
    const result = resolveWebhookTenant({
      localCompanyIdByProviderId: COMPANY_A,
      externalReferenceCompanyId: COMPANY_B,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.companyId).toBe(COMPANY_A);
    expect(result.externalReferenceMismatch).toBe(true);
  });

  it("claimed company divergente é cross-tenant", () => {
    expect(
      resolveWebhookTenant({
        localCompanyIdByProviderId: COMPANY_A,
        externalReferenceCompanyId: COMPANY_A,
        claimedCompanyId: COMPANY_B,
      }),
    ).toEqual({ ok: false, reason: "cross_tenant" });
  });
});

describe("webhook replay e concorrência", () => {
  it("evento já processado é duplicado", () => {
    expect(decideWebhookReplay("processed")).toBe("duplicate");
    expect(decideWebhookReplay("ignored")).toBe("duplicate");
  });

  it("evento failed/received pode ser reprocessado", () => {
    expect(decideWebhookReplay("failed")).toBe("process");
    expect(decideWebhookReplay("received")).toBe("process");
    expect(decideWebhookReplay(null)).toBe("process");
  });

  it("unique violation 23505 é duplicata lógica", () => {
    expect(interpretUniqueViolation("23505")).toBe("duplicate");
    expect(interpretUniqueViolation("23503")).toBe("other");
  });

  it("mesmo payment concorrente escolhe um efeito via id único", () => {
    const latest = pickLatestPayment([
      {
        providerUpdatedAt: "2026-08-01T10:00:00.000Z",
        paidAt: "2026-08-01T10:00:00.000Z",
        status: "approved",
      },
      {
        providerUpdatedAt: "2026-08-01T09:00:00.000Z",
        paidAt: "2026-08-01T09:00:00.000Z",
        status: "pending",
      },
    ]);
    expect(latest?.status).toBe("approved");
  });
});

describe("ordering / replay de snapshot", () => {
  it("evento mais antigo não aplica", () => {
    expect(
      shouldApplyProviderSnapshot({
        localProviderUpdatedAt: "2026-08-10T12:00:00.000Z",
        incomingProviderUpdatedAt: "2026-08-10T11:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("evento igual ou mais novo aplica", () => {
    expect(
      shouldApplyProviderSnapshot({
        localProviderUpdatedAt: "2026-08-10T12:00:00.000Z",
        incomingProviderUpdatedAt: "2026-08-10T12:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("pending antigo não regride active", () => {
    expect(
      shouldApplyLocalStatusTransition({
        currentLocalStatus: "active",
        incomingLocalStatus: null,
        snapshotIsNewerOrEqual: true,
      }),
    ).toBe(false);
  });

  it("rejected mais antigo não regride active", () => {
    expect(
      shouldApplyLocalStatusTransition({
        currentLocalStatus: "active",
        incomingLocalStatus: "past_due",
        snapshotIsNewerOrEqual: false,
      }),
    ).toBe(false);
  });

  it("approved novo ativa", () => {
    expect(
      shouldApplyLocalStatusTransition({
        currentLocalStatus: "trialing",
        incomingLocalStatus: "active",
        snapshotIsNewerOrEqual: true,
      }),
    ).toBe(true);
  });
});

describe("assinatura de webhook", () => {
  it("usa data.id da query ou do body, nunca só um deles como fallback silencioso invertido", () => {
    expect(resolveWebhookDataId("abc", "body")).toBe("abc");
    expect(resolveWebhookDataId(null, "body")).toBe("body");
    expect(resolveWebhookDataId(null, null)).toBeNull();
  });

  it("event id estável prefere x-request-id", () => {
    expect(
      buildWebhookProviderEventId({
        xRequestId: "req-1",
        eventType: "payment",
        resourceId: "pay-1",
        action: "updated",
      }),
    ).toBe("req-1");
  });
});
