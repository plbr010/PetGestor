import { cn } from "@/lib/utils";

const FLOW = [
  { id: "scheduled", label: "Agendado", tip: "Pet na agenda." },
  { id: "checkin", label: "Check-in", tip: "Quando o pet chegar." },
  { id: "in_progress", label: "Em atendimento", tip: "Serviço em andamento." },
  { id: "ready", label: "Pronto", tip: "Aguardando busca." },
  { id: "delivered", label: "Entregue", tip: "Finalizado com o tutor." },
] as const;

type WorkflowGuidePanelProps = {
  className?: string;
};

/** Guia visual educativo — não altera status reais de atendimento. */
export function WorkflowGuidePanel({ className }: WorkflowGuidePanelProps) {
  return (
    <section
      data-tour-id="panel-workflow"
      aria-label="Fluxo de atendimento"
      className={cn("rounded-2xl border bg-card p-4 sm:p-5", className)}
    >
      <h2 className="text-base font-semibold tracking-tight">Fluxo do atendimento</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Acompanhe cada pet sem alterar status automaticamente neste guia.
      </p>
      <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
        {FLOW.map((step, index) => (
          <li
            key={step.id}
            className="flex flex-1 items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5 sm:min-w-[8.5rem]"
          >
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <span>
              <span className="block text-sm font-medium">{step.label}</span>
              <span className="block text-xs text-muted-foreground">{step.tip}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
