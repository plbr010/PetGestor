import { cn } from "@/lib/utils";

type FinanceIntroBannerProps = {
  className?: string;
};

export function FinanceIntroBanner({ className }: FinanceIntroBannerProps) {
  return (
    <div
      data-tour-id="panel-finance"
      className={cn(
        "rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 sm:px-5 sm:py-4",
        className,
      )}
    >
      <p className="text-sm font-medium tracking-tight">
        Seu financeiro também fica organizado automaticamente.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Ao concluir os atendimentos, acompanhe receitas, despesas, pagamentos, realizado e
        projetado.
      </p>
    </div>
  );
}
