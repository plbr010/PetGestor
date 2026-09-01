import { describe, expect, it } from "vitest";

import {
  addDaysToDateString,
  formatDateInTimezone,
  resolveFutureLocalDateTime,
  timeToMinutes,
} from "@/features/demo/seed-scheduling";
import { DEMO_TIMEZONE } from "@/config/demo-seed-data";

describe("seed-scheduling", () => {
  it("formata data no fuso da empresa", () => {
    const date = new Date("2026-09-01T15:00:00.000Z");
    expect(formatDateInTimezone(date, DEMO_TIMEZONE)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("converte horário para minutos", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("14:00")).toBe(840);
  });

  it("soma dias em string de data", () => {
    expect(addDaysToDateString("2026-09-01", 7)).toBe("2026-09-08");
  });

  it("retorna horário futuro no fuso demo", () => {
    const now = new Date("2026-09-01T20:00:00.000Z");
    const iso = resolveFutureLocalDateTime("08:30", DEMO_TIMEZONE, now);
    expect(new Date(iso).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("demo-seed-data", () => {
  it("tem tutores, pets e serviços alinhados", async () => {
    const { DEMO_CUSTOMERS, DEMO_PETS, DEMO_SERVICES } = await import("@/config/demo-seed-data");

    expect(DEMO_CUSTOMERS.length).toBeGreaterThanOrEqual(4);
    expect(DEMO_PETS.length).toBeGreaterThanOrEqual(4);
    expect(DEMO_SERVICES.length).toBeGreaterThanOrEqual(3);

    for (const pet of DEMO_PETS) {
      expect(DEMO_CUSTOMERS.some((customer) => customer.key === pet.customerKey)).toBe(true);
    }
  });
});
