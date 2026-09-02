import { describe, expect, it } from "vitest";

import {
  canConsumePackage,
  computePackageExpiresAt,
  getEligibleCustomerPackagesForBooking,
  getUnassignedPackageHint,
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

const SERVICE_BANHO = "11111111-1111-4111-8111-111111111111";
const SERVICE_TOSA = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PET_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PET_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function soldPackage(
  overrides: Partial<{
    id: string;
    customerId: string;
    petId: string;
    startsAt: string;
    expiresAt: string;
    status: "active" | "expired" | "fully_used" | "cancelled";
    remaining: number;
    serviceId: string;
  }> = {},
) {
  const serviceId = overrides.serviceId ?? SERVICE_BANHO;
  return {
    id: overrides.id ?? "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    customerId: overrides.customerId ?? CUSTOMER_A,
    petId: overrides.petId ?? PET_A,
    name: "Pacote Banho",
    startsAt: overrides.startsAt ?? "2026-01-01",
    expiresAt: overrides.expiresAt ?? "2099-12-31",
    status: overrides.status ?? ("active" as const),
    items: [
      {
        serviceId,
        serviceName: "Banho",
        remaining: overrides.remaining ?? 3,
      },
    ],
  };
}

describe("getEligibleCustomerPackagesForBooking", () => {
  const base = {
    today: "2026-09-02",
    timeZone: "America/Sao_Paulo",
    customerId: CUSTOMER_A,
    petId: PET_A,
    serviceId: SERVICE_BANHO,
  };

  it("lista apenas pacote vendido, ativo, válido e com saldo do serviço", () => {
    const eligible = getEligibleCustomerPackagesForBooking({
      ...base,
      packages: [
        soldPackage(),
        soldPackage({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", petId: PET_B }),
        soldPackage({
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          remaining: 0,
        }),
        soldPackage({
          id: "99999999-9999-4999-8999-999999999999",
          serviceId: SERVICE_TOSA,
        }),
      ],
    });

    expect(eligible).toHaveLength(1);
    expect(eligible[0]?.id).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(eligible[0]?.remaining).toBe(3);
  });

  it("oculta pacote ainda não iniciado ou expirado", () => {
    expect(
      getEligibleCustomerPackagesForBooking({
        ...base,
        packages: [soldPackage({ startsAt: "2026-10-01" })],
      }),
    ).toHaveLength(0);

    expect(
      getEligibleCustomerPackagesForBooking({
        ...base,
        packages: [soldPackage({ expiresAt: "2026-01-01" })],
      }),
    ).toHaveLength(0);
  });

  it("não lista catálogo: exige pacote atribuído ao pet", () => {
    expect(
      getEligibleCustomerPackagesForBooking({
        ...base,
        packages: [],
      }),
    ).toHaveLength(0);
  });
});

describe("getUnassignedPackageHint", () => {
  it("explica quando o modelo existe mas não foi vendido ao pet", () => {
    const hint = getUnassignedPackageHint({
      customerId: CUSTOMER_A,
      petId: PET_A,
      serviceId: SERVICE_BANHO,
      eligibleCount: 0,
      packages: [],
      catalogPackages: [{ serviceIds: [SERVICE_BANHO] }],
    });

    expect(hint).toMatch(/não foi vendido/i);
    expect(hint).toMatch(/ficha do pet/i);
  });

  it("explica quando o pet tem pacote incompatível ou sem saldo", () => {
    const hint = getUnassignedPackageHint({
      customerId: CUSTOMER_A,
      petId: PET_A,
      serviceId: SERVICE_BANHO,
      eligibleCount: 0,
      packages: [soldPackage({ remaining: 0 })],
      catalogPackages: [{ serviceIds: [SERVICE_BANHO] }],
    });

    expect(hint).toMatch(/sessão disponível/i);
  });

  it("não mostra aviso se já há pacote elegível ou sem catálogo", () => {
    expect(
      getUnassignedPackageHint({
        customerId: CUSTOMER_A,
        petId: PET_A,
        serviceId: SERVICE_BANHO,
        eligibleCount: 1,
        packages: [soldPackage()],
        catalogPackages: [{ serviceIds: [SERVICE_BANHO] }],
      }),
    ).toBeNull();

    expect(
      getUnassignedPackageHint({
        customerId: CUSTOMER_A,
        petId: PET_A,
        serviceId: SERVICE_BANHO,
        eligibleCount: 0,
        packages: [],
        catalogPackages: [],
      }),
    ).toBeNull();
  });
});

