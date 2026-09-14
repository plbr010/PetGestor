import { describe, expect, it } from "vitest";

import { getMetadataBase, getMetadataBaseUrl } from "@/lib/seo/metadata-base";

describe("metadata base URL", () => {
  it("usa APP_URL configurada e não inventa domínio", () => {
    expect(
      getMetadataBaseUrl({
        APP_URL: "https://app.example.com/",
      }),
    ).toBe("https://app.example.com");
    expect(getMetadataBase({ APP_URL: "https://app.example.com" }).href).toBe(
      "https://app.example.com/",
    );
  });

  it("cai em localhost só quando não há URL configurada", () => {
    expect(getMetadataBaseUrl({})).toBe("http://localhost:3000");
  });
});
