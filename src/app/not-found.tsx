import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import { brand } from "@/config/brand";
import { marketingContent } from "@/config/marketing";
import { MAIN_CONTENT_ID, publicPaths } from "@/config/public-routes";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <main
      id={MAIN_CONTENT_ID}
      className="flex min-h-screen flex-col items-center justify-center px-4 py-16"
    >
      <EmptyState
        title="Página não encontrada"
        description="O endereço acessado não existe ou foi movido."
        className="max-w-lg border-none bg-transparent"
      />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <ButtonLink href={publicPaths.home} className="min-h-11">
          Voltar para {brand.name}
        </ButtonLink>
        <ButtonLink href={marketingContent.signupHref} variant="outline" className="min-h-11">
          {marketingContent.trialCtaLabel}
        </ButtonLink>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Precisa de ajuda?{" "}
        <Link
          href={marketingContent.loginHref}
          className="font-medium text-primary hover:underline"
        >
          Acesse a área de login
        </Link>
      </p>
    </main>
  );
}
