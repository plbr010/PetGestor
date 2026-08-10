import { Check } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { marketingContent } from "@/config/marketing";

const pricingFeatures = [
  "Agenda e atendimentos demonstrativos",
  "Cadastro de tutores e pets (futuro)",
  "Dashboard com indicadores básicos",
  "Suporte durante o período de teste",
] as const;

export function PricingSection() {
  const { pricingTeaser } = marketingContent;

  return (
    <section id="precos" className="border-y bg-muted/30 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg">
          <Card className="border-primary/20 bg-card shadow-md">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{pricingTeaser.title}</CardTitle>
              <CardDescription>{pricingTeaser.description}</CardDescription>
              <div className="pt-4">
                <p className="text-4xl font-bold text-primary">{pricingTeaser.price}</p>
                <p className="text-sm text-muted-foreground">{pricingTeaser.period}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {pricingFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <ButtonLink href="/cadastro" className="w-full" size="lg">
                Começar teste gratuito
              </ButtonLink>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
