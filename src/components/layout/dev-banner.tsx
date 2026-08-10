import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

type DevBannerProps = {
  className?: string;
};

export function DevBanner({ className }: DevBannerProps) {
  return (
    <div
      className={cn(
        "border-b border-warning/30 bg-warning/15 px-4 py-2 text-center text-xs text-warning-foreground",
        className,
      )}
      role="status"
    >
      {brand.developmentNotice}
    </div>
  );
}
