import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type ErrorMessageProps = {
  title?: string;
  message: string;
  className?: string;
};

export function ErrorMessage({
  title = "Algo deu errado",
  message,
  className,
}: ErrorMessageProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive",
        className,
      )}
      role="alert"
    >
      <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-destructive/90">{message}</p>
      </div>
    </div>
  );
}
