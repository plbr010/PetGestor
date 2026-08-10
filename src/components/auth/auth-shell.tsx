import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/shared/brand-logo";
import { DevBanner } from "@/components/layout/dev-banner";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  return (
    <>
      <DevBanner />
      <PublicHeader />
      <main className="relative flex min-h-[calc(100vh-4rem)] flex-col">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.94_0.04_175),transparent_50%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10 sm:px-6">
          <div className="w-full space-y-6">
            <Link
              href="/"
              className="mx-auto flex w-fit rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <BrandLogo size="md" className="justify-center" />
            </Link>
            {children}
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
