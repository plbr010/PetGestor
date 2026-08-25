import { describe, expect, it } from "vitest";

import {
  bestRank,
  foldSearchText,
  prepareSearchQuery,
  rankMatch,
} from "@/features/global-search/normalize";
import {
  GLOBAL_SEARCH_LIMIT_PER_GROUP,
  GLOBAL_SEARCH_MIN_CHARS,
} from "@/features/global-search/types";
import { hasPermission, type MembershipAccess } from "@/lib/auth/permissions";

describe("global search normalize", () => {
  it("ignora acentos na comparação", () => {
    expect(foldSearchText("José")).toBe("jose");
    expect(foldSearchText("BANHO")).toBe("banho");
    expect(rankMatch("José Silva", "jose")).toBe(1);
    expect(rankMatch("Thor", "thor")).toBe(0);
    expect(rankMatch("Anthor", "thor")).toBe(2);
  });

  it("prioriza exact > prefix > contains", () => {
    expect(bestRank(["Thor"], "thor")).toBe(0);
    expect(bestRank(["Thorzinho"], "thor")).toBe(1);
    expect(bestRank(["Meu Thor"], "thor")).toBe(2);
  });

  it("normaliza telefone sem máscara", () => {
    const prepared = prepareSearchQuery("(32) 99999-9999");
    expect(prepared.phoneDigits).toBe("32999999999");
    expect(prepareSearchQuery("32999999999").phoneDigits).toBe("32999999999");
  });

  it("exige mínimo de caracteres na preparação útil", () => {
    expect(GLOBAL_SEARCH_MIN_CHARS).toBe(2);
    expect(prepareSearchQuery("T").term.length).toBeLessThan(GLOBAL_SEARCH_MIN_CHARS);
  });
});

describe("global search permissions gate", () => {
  const staffWithoutFinance: MembershipAccess = {
    role: "staff",
    accessProfile: "reception",
    permissions: ["dashboard.view", "customers.view", "pets.view"],
    accessRevokedAt: null,
    ownScheduleOnly: false,
    employeeId: null,
  };

  it("bloqueia módulos sem permissão", () => {
    expect(hasPermission(staffWithoutFinance, "finance.view")).toBe(false);
    expect(hasPermission(staffWithoutFinance, "inventory.view")).toBe(false);
    expect(hasPermission(staffWithoutFinance, "customers.view")).toBe(true);
  });

  it("limita preview por categoria", () => {
    expect(GLOBAL_SEARCH_LIMIT_PER_GROUP).toBe(5);
  });
});
