import { Check } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { marketingContent } from "@/config/marketing";
import { cn } from "@/lib/utils";

export function PricingSection() {
  const { pricing } = marketingContent;

  return (
    <section id="precos" className="scroll-mt-24 border-y bg-muted/30 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Preços</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">{pricing.intro}</p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          <Card className="border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">
                <h3 className="text-xl font-semibold">{pricing.monthly.title}</h3>
              </CardTitle>
              <CardDescription>Cobrança mensal</CardDescription>
              <div className="pt-3">
                <p className="text-3xl font-bold break-words text-primary sm:text-4xl">
                  {pricing.monthly.price}
                </p>
                <p className="text-sm text-muted-foreground">{pricing.monthly.period}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {pricing.monthly.bullets.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <ButtonLink
                href={marketingContent.signupHref}
                className="h-11 min-h-11 w-full"
                size="lg"
                variant="outline"
              >
                {marketingContent.pricingCtaLabel}
              </ButtonLink>
            </CardContent>
          </Card>

          <Card className={cn("border-primary/30 bg-card shadow-md")}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">
                  <h3 className="text-xl font-semibold">{pricing.annual.title}</h3>
                </CardTitle>
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  {pricing.annual.badge}
                </Badge>
              </div>
              <CardDescription>Cobrança anual</CardDescription>
              <div className="pt-3">
                <p className="text-3xl font-bold break-words text-primary sm:text-4xl">
                  {pricing.annual.price}
                </p>
                <p className="text-sm text-muted-foreground">{pricing.annual.period}</p>
                <p className="mt-2 text-sm font-medium text-primary">{pricing.annual.savings}</p>
                <p className="text-sm text-muted-foreground">{pricing.annual.equivalent}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {pricing.annual.bullets.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <ButtonLink
                href={marketingContent.signupHref}
                className="h-11 min-h-11 w-full"
                size="lg"
              >
                {marketingContent.pricingCtaLabel}
              </ButtonLink>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
