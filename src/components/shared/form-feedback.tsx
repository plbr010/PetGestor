import { cn } from "@/lib/utils";

type FormFeedbackProps = {
  message: string;
  variant?: "success" | "error";
  className?: string;
};

export function FormFeedback({
  message,
  variant = "error",
  className,
}: FormFeedbackProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        variant === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-primary/20 bg-primary/5 text-foreground",
        className,
      )}
    >
      {message}
    </div>
  );
}
