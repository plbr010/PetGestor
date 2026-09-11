import { describe, expect, it } from "vitest";

import { computeAppointmentPreview } from "@/features/appointments/preview";

const fixedService = {
  pricing_mode: "fixed" as const,
  price_cents: 8000,
  duration_minutes: 60,
};

describe("computeAppointmentPreview", () => {
  it("usa a mesma fonte para pacote, preço e duração", () => {
    const withPackage = computeAppointmentPreview({
      service: fixedService,
      petSize: "",
      sizePrices: [],
      customerPackageId: "pkg-1",
    });
    const withoutPackage = computeAppointmentPreview({
      service: fixedService,
      petSize: "",
      sizePrices: [],
      customerPackageId: "",
    });

    expect(withPackage).toEqual({ price: 0, duration: 60, coveredByPackage: true });
    expect(withoutPackage).toEqual({ price: 8000, duration: 60, coveredByPackage: false });
  });

  it("não zera o preço quando o pacote visível está vazio", () => {
    const preview = computeAppointmentPreview({
      service: fixedService,
      petSize: "",
      sizePrices: [],
      customerPackageId: "",
    });
    expect(preview?.coveredByPackage).toBe(false);
    expect(preview?.price).toBe(8000);
  });
});
