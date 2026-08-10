import { ArrowRight, CreditCard, Sparkles } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import { marketingContent } from "@/config/marketing";

import { DashboardPreview } from "./dashboard-preview";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.92_0.04_175),transparent_55%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="space-y-6">
          <Badge
            variant="secondary"
            className="rounded-full px-3 py-1 text-xs font-medium"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {marketingContent.heroBadge}
          </Badge>

          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-[3.25rem]">
              {marketingContent.heroTitle}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              {marketingContent.heroSubtitle}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/cadastro" size="lg" className="h-11 px-6">
              {marketingContent.trialCtaLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/dashboard" variant="outline" size="lg" className="h-11 px-6">
              Ver demonstração
            </ButtonLink>
          </div>

          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CreditCard className="size-4 shrink-0" aria-hidden="true" />
            {marketingContent.trialNote}
          </p>
        </div>

        <DashboardPreview />
      </div>
    </section>
  );
}
