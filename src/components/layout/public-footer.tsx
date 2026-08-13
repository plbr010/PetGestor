import Link from "next/link";

import { BrandLogo } from "@/components/shared/brand-logo";
import { brand } from "@/config/brand";
import { marketingContent } from "@/config/marketing";

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
          <div className="space-y-4">
            <BrandLogo size="sm" />
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {brand.description}
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold">Navegação</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {marketingContent.navLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold">Acesso</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/entrar" className="transition-colors hover:text-foreground">
                  Entrar
                </Link>
              </li>
              <li>
                <Link href="/cadastro" className="transition-colors hover:text-foreground">
                  Testar grátis
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="transition-colors hover:text-foreground">
                  Ver demonstração
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t pt-6 text-center text-sm text-muted-foreground sm:text-left">
          © {year} {brand.name}. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
