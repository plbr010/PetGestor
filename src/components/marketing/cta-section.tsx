import { ButtonLink } from "@/components/ui/button-link";
import { marketingContent } from "@/config/marketing";

export function CtaSection() {
  const { cta } = marketingContent;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="surface-card overflow-hidden bg-gradient-to-br from-primary/10 via-card to-card px-6 py-12 text-center sm:px-10 sm:py-14">
          <h2 className="text-3xl font-bold sm:text-4xl">{cta.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {cta.description}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/cadastro" size="lg" className="h-11 min-w-[220px] px-6">
              {marketingContent.trialCtaLabel}
            </ButtonLink>
            <ButtonLink
              href="/entrar"
              variant="outline"
              size="lg"
              className="h-11 min-w-[220px] px-6"
            >
              Já tenho conta
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
