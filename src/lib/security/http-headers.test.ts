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

  it("expõe os headers para a raiz e para demais caminhos", () => {
    const config = buildNextSecurityHeaders({ enableHsts: false });
    expect(config.map((entry) => entry.source)).toEqual(["/", "/:path*"]);
    expect(config[0]?.headers).toEqual(config[1]?.headers);
  });

  it("next.config usa o módulo canônico de headers", () => {
    const source = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(source).toContain("buildNextSecurityHeaders");
    expect(source).toContain("shouldEnableHsts");
    expect(source).not.toMatch(/script-src/);
  });
});
