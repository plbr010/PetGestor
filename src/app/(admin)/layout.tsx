import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/shared/brand-logo";
import { ButtonLink } from "@/components/ui/button-link";
import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requirePlatformAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <BrandLogo size="sm" />
            </Link>
            <div>
              <p className="text-sm font-semibold">Admin PetGestor</p>
              <p className="text-xs text-muted-foreground">Painel interno de contas e assinaturas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ButtonLink href="/dashboard" variant="outline" size="sm">
              Voltar ao dashboard
            </ButtonLink>
            <LogoutButton size="sm" variant="outline" label="Sair" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
