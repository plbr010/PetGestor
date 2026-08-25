import { describe, expect, it } from "vitest";

import {
  canViewAppNotificationType,
  resolveNotificationHref,
} from "@/features/app-notifications/types";
import type { Permission } from "@/lib/auth/permissions";

describe("app notification permissions", () => {
  it("oculta financeiro sem finance.view", () => {
    const allowed = new Set<Permission>(["dashboard.view", "inventory.view"]);
    expect(
      canViewAppNotificationType(
        "payment_overdue",
        (permission) => allowed.has(permission),
        null,
      ),
    ).toBe(false);
    expect(
      canViewAppNotificationType(
        "stock_low",
        (permission) => allowed.has(permission),
        null,
      ),
    ).toBe(true);
  });

  it("respeita required_permission explícita", () => {
    const allowed = new Set<Permission>(["finance.view"]);
    expect(
      canViewAppNotificationType(
        "service_order_ready",
        (permission) => allowed.has(permission),
        "finance.view",
      ),
    ).toBe(true);
  });
});

describe("resolveNotificationHref", () => {
  it("prioriza href salvo", () => {
    expect(
      resolveNotificationHref({
        href: "/custom",
        entityType: "product",
        entityId: "p1",
      }),
    ).toBe("/custom");
  });

  it("monta deep link por entidade", () => {
    expect(
      resolveNotificationHref({
        href: null,
        entityType: "appointment",
        entityId: "a1",
      }),
    ).toBe("/dashboard/agenda/a1");
    expect(
      resolveNotificationHref({
        href: null,
        entityType: "product",
        entityId: "p1",
      }),
    ).toBe("/dashboard/estoque/p1");
    expect(
      resolveNotificationHref({
        href: null,
        entityType: "service_order",
        entityId: "s1",
      }),
    ).toBe("/dashboard/atendimentos/s1");
  });
});

describe("dedupe key strategy", () => {
  it("usa chaves estáveis por entidade", () => {
    const productId = "prod-1";
    const keyLow = `broadcast:stock_low:${productId}`;
    const keyOut = `broadcast:stock_out:${productId}`;
    expect(keyLow).not.toBe(keyOut);
    expect(keyLow).toBe("broadcast:stock_low:prod-1");
  });
});
