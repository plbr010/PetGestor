import { marketingContent } from "@/config/marketing";

export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Como funciona</h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Três passos simples para começar a organizar seu pet shop.
          </p>
        </div>

        <ol className="grid gap-6 md:grid-cols-3">
          {marketingContent.steps.map((item) => (
            <li
              key={item.step}
              className="surface-card relative p-6 transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {item.step}
              </div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
