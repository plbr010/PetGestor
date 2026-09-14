import Link from "next/link";

import { BrandLogo } from "@/components/shared/brand-logo";
import { brand } from "@/config/brand";
import { marketingContent } from "@/config/marketing";
import { buildWhatsAppUrl } from "@/lib/phone";

const footerLinkClass =
  "rounded-sm transition-colors hover:text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function PublicFooter() {
  const year = new Date().getFullYear();
  const supportHref = buildWhatsAppUrl(
    brand.supportWhatsApp.phoneLocal,
    brand.supportWhatsApp.prefillMessage,
  );

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
                  <Link href={link.href} className={footerLinkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold">Acesso</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href={marketingContent.loginHref} className={footerLinkClass}>
                  {marketingContent.loginCtaLabel}
                </Link>
              </li>
              <li>
                <Link href={marketingContent.signupHref} className={footerLinkClass}>
                  {marketingContent.signupShortCtaLabel}
                </Link>
              </li>
              <li>
                <Link href={marketingContent.demoHref} className={footerLinkClass}>
                  {marketingContent.demoCtaLabel}
                </Link>
              </li>
              {supportHref ? (
                <li>
                  <a
                    href={supportHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={footerLinkClass}
                  >
                    {marketingContent.supportCtaLabel}
                  </a>
                </li>
              ) : null}
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
