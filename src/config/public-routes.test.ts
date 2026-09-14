import { describe, expect, it } from "vitest";

import {
  isProtectedAppPath,
  MAIN_CONTENT_ID,
  publicPaths,
} from "@/config/public-routes";

describe("public routes", () => {
  it("mantém landing, login, cadastro e âncoras públicas", () => {
    expect(publicPaths.home).toBe("/");
    expect(publicPaths.login).toBe("/entrar");
    expect(publicPaths.signup).toBe("/cadastro");
    expect(publicPaths.demo).toBe("/#demonstracao");
    expect(publicPaths.features).toBe("/#recursos");
    expect(publicPaths.howItWorks).toBe("/#como-funciona");
    expect(publicPaths.pricing).toBe("/#precos");
    expect(MAIN_CONTENT_ID).toBe("conteudo-principal");
  });

  it("identifica rotas protegidas que não podem servir de demo", () => {
    expect(isProtectedAppPath("/dashboard")).toBe(true);
    expect(isProtectedAppPath("/dashboard/agenda")).toBe(true);
    expect(isProtectedAppPath("/admin")).toBe(true);
    expect(isProtectedAppPath("/assinatura")).toBe(true);
    expect(isProtectedAppPath("/cadastro")).toBe(false);
    expect(isProtectedAppPath("/entrar")).toBe(false);
    expect(isProtectedAppPath("/#demonstracao")).toBe(false);
  });
});
