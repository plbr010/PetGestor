import { describe, expect, it } from "vitest";

import { TRIAL_DURATION_HOURS } from "@/config/subscription";
import {
  formatTrialBannerMessage,
  formatTrialRemaining,
  getTrialDurationHoursForTests,
} from "@/features/subscription/utils";

describe("formatTrialRemaining", () => {
  const serverNow = new Date("2026-08-06T10:00:00.000Z");

  it("formata dias e horas quando restam mais de 24h", () => {
    const trialEndsAt = new Date("2026-08-08T15:00:00.000Z").toISOString();
    expect(formatTrialRemaining(trialEndsAt, serverNow)).toBe("2 dias e 5 horas");
  });

  it("formata horas e minutos quando restam menos de 24h", () => {
    const trialEndsAt = new Date("2026-08-06T23:42:00.000Z").toISOString();
    expect(formatTrialRemaining(trialEndsAt, serverNow)).toBe("13h 42min");
  });

  it("retorna encerrado após expiração", () => {
    const trialEndsAt = new Date("2026-08-05T10:00:00.000Z").toISOString();
    expect(formatTrialRemaining(trialEndsAt, serverNow)).toBe("encerrado");
  });
});

describe("formatTrialBannerMessage", () => {
  it("usa mensagem curta abaixo de 24h", () => {
    const serverNow = new Date("2026-08-06T10:00:00.000Z");
    const trialEndsAt = new Date("2026-08-06T23:42:00.000Z").toISOString();
    expect(formatTrialBannerMessage(trialEndsAt, serverNow)).toContain("13h 42min");
  });
});

describe("getTrialDurationHoursForTests", () => {
  it("expõe 72 horas", () => {
    expect(getTrialDurationHoursForTests()).toBe(72);
    expect(TRIAL_DURATION_HOURS).toBe(72);
  });
});
