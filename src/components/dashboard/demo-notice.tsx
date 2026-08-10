import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

type DemoNoticeProps = {
  className?: string;
};

export function DemoNotice({ className }: DemoNoticeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Info className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>Dados demonstrativos — nenhuma informação real está sendo exibida.</span>
    </div>
  );
}
