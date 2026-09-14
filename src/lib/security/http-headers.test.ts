import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildNextSecurityHeaders,
  buildSecurityHeaderList,
  FRAME_ANCESTORS_CSP,
  shouldEnableHsts,
} from "@/lib/security/http-headers";

describe("security HTTP headers", () => {
  it("aplica headers seguros sem CSP ampla de scripts", () => {
    const headers = buildSecurityHeaderList({ enableHsts: false });
    const map = Object.fromEntries(headers.map((header) => [header.key, header.value]));

    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Content-Security-Policy"]).toBe(FRAME_ANCESTORS_CSP);
    expect(map["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(map["Content-Security-Policy"]).not.toMatch(/script-src|\*/);
    expect(map["Permissions-Policy"]).toContain("camera=()");
    expect(map["Permissions-Policy"]).toContain("geolocation=()");
    expect(map["Strict-Transport-Security"]).toBeUndefined();
  });

  it("só envia HSTS em produção HTTPS da Vercel", () => {
    expect(shouldEnableHsts({ VERCEL_ENV: "production" })).toBe(true);
    expect(shouldEnableHsts({ VERCEL_ENV: "preview" })).toBe(false);
    expect(shouldEnableHsts({ NODE_ENV: "production" })).toBe(false);

    const withHsts = buildSecurityHeaderList({ enableHsts: true });
    expect(withHsts.some((header) => header.key === "Strict-Transport-Security")).toBe(
      true,
    );
  });

  it("aplica uma única regra /:path* sem duplicar a raiz", () => {
    const config = buildNextSecurityHeaders({ enableHsts: false });
    const sources = config.map((entry) => entry.source);
    expect(sources).toContain("/:path*");
    expect(sources.filter((source) => source === "/")).toHaveLength(0);
    expect(sources.filter((source) => source === "/:path*")).toHaveLength(1);

    const rootRule = config.find((entry) => entry.source === "/:path*");
    const map = Object.fromEntries(
      (rootRule?.headers ?? []).map((header) => [header.key, header.value]),
    );
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(map["Permissions-Policy"]).toContain("camera=()");
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Content-Security-Policy"]).toBe(FRAME_ANCESTORS_CSP);
  });

  it("marca callbacks /auth/* com X-Robots-Tag noindex", () => {
    const config = buildNextSecurityHeaders({ enableHsts: false });
    const authRule = config.find((entry) => entry.source === "/auth/:path*");
    expect(authRule?.headers).toEqual([
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]);
  });

  it("next.config usa o módulo canônico de headers", () => {
    const source = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(source).toContain("buildNextSecurityHeaders");
    expect(source).toContain("shouldEnableHsts");
    expect(source).not.toMatch(/script-src/);
  });
});
