import { describe, expect, it } from "vitest";

import {
  loginRobots,
  publicIndexRobots,
  sitemapPublicPathnames,
  technicalAuthRobots,
} from "@/lib/seo/robots-policy";

describe("política de indexação pública", () => {
  it("indexa landing e cadastro como conversão; login e auth técnica não", () => {
    expect(publicIndexRobots).toEqual({ index: true, follow: true });
    expect(loginRobots).toEqual({ index: false, follow: true });
    expect(technicalAuthRobots).toEqual({ index: false, follow: false });
    expect(sitemapPublicPathnames).toEqual(["/", "/cadastro"]);
    expect(sitemapPublicPathnames).not.toContain("/entrar");
  });
});
