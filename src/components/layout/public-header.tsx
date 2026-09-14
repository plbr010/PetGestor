"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/shared/brand-logo";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { buttonVariants } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { brand } from "@/config/brand";
import { marketingContent } from "@/config/marketing";
import { publicPaths } from "@/config/public-routes";
import { cn } from "@/lib/utils";

export function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <SkipToContent />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href={publicPaths.home}
          className="min-w-0 shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`${brand.name}, página inicial`}
        >
          <BrandLogo size="sm" />
        </Link>

        <nav
          className="hidden items-center gap-8 md:flex"
          aria-label="Navegação principal"
        >
          {marketingContent.navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <ButtonLink href={marketingContent.loginHref} variant="ghost" size="sm" className="min-h-11 px-3">
            {marketingContent.loginCtaLabel}
          </ButtonLink>
          <ButtonLink href={marketingContent.signupHref} size="sm" className="min-h-11 px-3">
            {marketingContent.signupShortCtaLabel}
          </ButtonLink>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            aria-label="Abrir menu de navegação"
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "min-h-11 min-w-11 md:hidden",
            )}
          >
            <Menu className="size-4" aria-hidden="true" />
          </SheetTrigger>
          <SheetContent side="right" className="w-full max-w-sm">
            <SheetHeader>
              <SheetTitle>{brand.name}</SheetTitle>
              <SheetDescription className="sr-only">
                Navegação da página pública do PetGestor
              </SheetDescription>
            </SheetHeader>
            <nav className="mt-6 flex flex-col gap-1" aria-label="Menu mobile">
              {marketingContent.navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-4 flex flex-col gap-2 border-t pt-4">
                <ButtonLink
                  href={marketingContent.loginHref}
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setOpen(false)}
                >
                  {marketingContent.loginCtaLabel}
                </ButtonLink>
                <ButtonLink
                  href={marketingContent.signupHref}
                  className="min-h-11"
                  onClick={() => setOpen(false)}
                >
                  {marketingContent.signupShortCtaLabel}
                </ButtonLink>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
