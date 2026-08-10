import {
  CalendarDays,
  ClipboardList,
  LineChart,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { marketingContent } from "@/config/marketing";

const benefitIcons: LucideIcon[] = [
  CalendarDays,
  Users,
  ClipboardList,
  LineChart,
];

export function BenefitsSection() {
  return (
    <section id="recursos" className="border-y bg-muted/30 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Tudo que seu pet shop precisa para operar melhor
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Recursos essenciais para organizar o dia a dia e ganhar visibilidade do negócio.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {marketingContent.benefits.map((benefit, index) => {
            const Icon = benefitIcons[index] ?? CalendarDays;

            return (
              <Card
                key={benefit.title}
                className="border bg-card/90 shadow-sm transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg">{benefit.title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {benefit.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Disponível nas próximas fases do produto.
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
