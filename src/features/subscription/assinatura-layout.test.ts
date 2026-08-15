import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("assinatura authenticated shell", () => {
  it("mantém /assinatura dentro do layout autenticado com sidebar", () => {
    const appLayout = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/layout.tsx"),
      "utf8",
    );
    const assinaturaPage = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/assinatura/page.tsx"),
      "utf8",
    );

    expect(appLayout).toContain("DashboardSidebar");
    expect(appLayout).toContain("DashboardUserProvider");
    expect(appLayout).toContain("requireUser");
    expect(appLayout).not.toContain("assertOperationalEntitlement");
    expect(assinaturaPage).toContain("DashboardHeader");
    expect(assinaturaPage).not.toContain("AuthShell");
    expect(assinaturaPage).not.toContain("LogoutButton");
  });

  it("gate operacional fica só em /dashboard/* e não em /assinatura", () => {
    const operationalLayout = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/dashboard/layout.tsx"),
      "utf8",
    );

    expect(operationalLayout).toContain("assertOperationalEntitlement");
    expect(
      existsSync(join(process.cwd(), "src/app/(auth)/assinatura/page.tsx")),
    ).toBe(false);
    expect(
      existsSync(join(process.cwd(), "src/app/(dashboard)/assinatura/page.tsx")),
    ).toBe(true);
  });

  it("usuário não autenticado continua sendo redirecionado (requireUser no shell)", () => {
    const appLayout = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/layout.tsx"),
      "utf8",
    );
    const requireUser = readFileSync(
      join(process.cwd(), "src/lib/auth/require-user.ts"),
      "utf8",
    );

    expect(appLayout).toContain("requireUser");
    expect(requireUser).toContain('redirect(loginPath)');
    expect(requireUser).toContain('"/entrar"');
  });

  it("entrar em /assinatura não executa logout", () => {
    const assinaturaPage = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/assinatura/page.tsx"),
      "utf8",
    );
    const content = readFileSync(
      join(
        process.cwd(),
        "src/features/subscription/components/subscription-page-content.tsx",
      ),
      "utf8",
    );

    expect(assinaturaPage).not.toContain("signOut");
    expect(assinaturaPage).not.toContain("LogoutButton");
    expect(content).not.toContain("LogoutButton");
    expect(content).not.toContain("signOutAction");
  });

  it("trial expirado pode abrir /assinatura sem entitlement no shell pai", () => {
    const appLayout = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/layout.tsx"),
      "utf8",
    );
    const requireEntitlement = readFileSync(
      join(process.cwd(), "src/features/subscription/require-entitlement.ts"),
      "utf8",
    );

    expect(appLayout).not.toContain("assertOperationalEntitlement");
    expect(requireEntitlement).toContain('SUBSCRIPTION_REQUIRED_PATH = "/assinatura"');
  });
});
