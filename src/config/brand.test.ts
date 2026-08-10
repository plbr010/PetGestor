import { describe, expect, it } from "vitest";

import { brand } from "@/config/brand";

describe("brand config", () => {
  it("expõe o nome temporário do produto", () => {
    expect(brand.name).toBe("PetGestor");
  });

  it("define metadados padrão para SEO", () => {
    expect(brand.defaultTitle).toContain(brand.name);
    expect(brand.defaultDescription.length).toBeGreaterThan(10);
  });
});
