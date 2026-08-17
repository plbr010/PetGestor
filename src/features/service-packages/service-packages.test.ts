import { describe, expect, it } from "vitest";

import {
  canConsumePackage,
  computePackageExpiresAt,
  packageItemsToRpcPayload,
  resolveDisplayStatus,
  sumPackageQuantities,
} from "@/features/service-packages/utils";

describe("sumPackageQuantities", () => {
  it("calcula total, usado e restante", () => {
    expect(
      sumPackageQuantities([
        { quantity_total: 4, quantity_used: 1 },
        { quantity_total: 1, quantity_used: 0 },
      ]),
    ).toEqual({ total: 5, used: 1, remaining: 4 });
  });

  it("impede saldo negativo no restante", () => {
    expect(sumPackageQuantities([{ quantity_total: 2, quantity_used: 5 }])).toEqual({
      total: 2,
      used: 5,
      remaining: 0,
    });
  });
});

describe("computePackageExpiresAt", () => {
  it("calcula validade inclusiva", () => {
    expect(computePackageExpiresAt("2026-08-01", 30)).toBe("2026-08-30");
    expect(computePackageExpiresAt("2026-08-01", 1)).toBe("2026-08-01");
  });
});

describe("resolveDisplayStatus", () => {
  it("marca pacote expirado", () => {
    expect(
      resolveDisplayStatus("active", "2026-01-01", 3, "America/Sao_Paulo"),
    ).toBe("expired");
  });

  it("marca pacote totalmente utilizado", () => {
    expect(
      resolveDisplayStatus("active", "2099-01-01", 0, "America/Sao_Paulo"),
    ).toBe("fully_used");
  });

  it("mantém pacote ativo com saldo e validade", () => {
    expect(
      resolveDisplayStatus("active", "2099-12-31", 2, "America/Sao_Paulo"),
    ).toBe("active");
  });
});

describe("canConsumePackage", () => {
  it("permite consumo com saldo e pacote ativo", () => {
    expect(
      canConsumePackage({
        status: "active",
        expiresAt: "2099-12-31",
        remainingForService: 2,
        timeZone: "America/Sao_Paulo",
      }),
    ).toBe(true);
  });

  it("impede consumo expirado", () => {
    expect(
      canConsumePackage({
        status: "active",
        expiresAt: "2020-01-01",
        remainingForService: 2,
        timeZone: "America/Sao_Paulo",
      }),
    ).toBe(false);
  });

  it("impede consumo sem saldo", () => {
    expect(
      canConsumePackage({
        status: "active",
        expiresAt: "2099-12-31",
        remainingForService: 0,
        timeZone: "America/Sao_Paulo",
      }),
    ).toBe(false);
  });
});

describe("multi-tenant isolation (domain)", () => {
  it("payload RPC inclui apenas service_id e quantity por item", () => {
    expect(
      packageItemsToRpcPayload([
        { serviceId: "11111111-1111-4111-8111-111111111111", quantity: 4 },
      ]),
    ).toEqual([{ service_id: "11111111-1111-4111-8111-111111111111", quantity: 4 }]);
  });
});
