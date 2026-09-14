import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { HeroSection } from "@/components/marketing/hero-section";
import { marketingContent } from "@/config/marketing";
import { publicPaths } from "@/config/public-routes";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("landing conversion CTAs", () => {
  it("hero leva cadastro ao trial e demonstração à prévia pública", () => {
    render(<HeroSection />);

    expect(
      screen.getByRole("link", { name: marketingContent.trialCtaLabel }),
    ).toHaveAttribute("href", publicPaths.signup);
    expect(
      screen.getByRole("link", { name: marketingContent.demoCtaLabel }),
    ).toHaveAttribute("href", publicPaths.demo);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      marketingContent.heroTitle,
    );
  });

  it("header desktop aponta Entrar e Testar grátis para as rotas corretas", () => {
    render(<PublicHeader />);

    expect(screen.getByRole("link", { name: marketingContent.loginCtaLabel })).toHaveAttribute(
      "href",
      publicPaths.login,
    );
    expect(
      screen.getByRole("link", { name: marketingContent.signupShortCtaLabel }),
    ).toHaveAttribute("href", publicPaths.signup);
    expect(screen.getByRole("link", { name: /página inicial/i })).toHaveAttribute(
      "href",
      publicPaths.home,
    );
    expect(screen.getByRole("link", { name: "Ir para o conteúdo principal" })).toHaveAttribute(
      "href",
      "#conteudo-principal",
    );
  });

  it("menu mobile abre, fecha com Escape e não aponta para área protegida", async () => {
    const user = userEvent.setup();
    render(<PublicHeader />);

    await user.click(screen.getByRole("button", { name: "Abrir menu de navegação" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu mobile" })).toBeInTheDocument();

    const demoLinks = screen.queryAllByRole("link", { name: marketingContent.demoCtaLabel });
    expect(demoLinks.every((link) => link.getAttribute("href") !== "/dashboard")).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("footer de demonstração não usa /dashboard", () => {
    render(<PublicFooter />);

    expect(screen.getByRole("link", { name: marketingContent.demoCtaLabel })).toHaveAttribute(
      "href",
      publicPaths.demo,
    );
    expect(screen.getByRole("link", { name: marketingContent.loginCtaLabel })).toHaveAttribute(
      "href",
      publicPaths.login,
    );
    expect(
      screen.getByRole("link", { name: marketingContent.signupShortCtaLabel }),
    ).toHaveAttribute("href", publicPaths.signup);
  });

  it("superfície pública não usa dashboard/admin como CTA de demo", () => {
    const files = [
      "src/components/marketing/hero-section.tsx",
      "src/components/layout/public-header.tsx",
      "src/components/layout/public-footer.tsx",
      "src/components/marketing/pricing-section.tsx",
      "src/components/marketing/cta-section.tsx",
      "src/app/not-found.tsx",
      "src/app/(public)/page.tsx",
    ];

    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/href=["']\/dashboard/);
      expect(source).not.toMatch(/href=["']\/admin/);
    }
  });

  it("âncoras da landing têm folga para o header sticky", () => {
    expect(read("src/components/marketing/benefits-section.tsx")).toMatch(
      /<h2 id="recursos"/,
    );
    expect(read("src/components/marketing/how-it-works-section.tsx")).toMatch(
      /<h2 id="como-funciona"/,
    );
    expect(read("src/components/marketing/pricing-section.tsx")).toMatch(
      /<h2 id="precos"/,
    );
    expect(read("src/components/marketing/dashboard-preview.tsx")).toContain(
      'id="demonstracao"',
    );
    expect(read("src/app/globals.css")).toContain("scroll-padding-top");
    expect(read("src/app/globals.css")).toContain("prefers-reduced-motion: reduce");
    expect(read("src/components/ui/sheet.tsx")).toContain("Fechar");
    expect(read("src/components/ui/sheet.tsx")).not.toContain(">Close<");
  });
});
