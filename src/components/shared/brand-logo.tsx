import { PawPrint } from "lucide-react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  showSubtitle?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizeStyles = {
  sm: {
    icon: "size-7 rounded-md",
    iconInner: "size-3.5",
    title: "text-sm",
    subtitle: "text-[10px]",
  },
  md: {
    icon: "size-9 rounded-lg",
    iconInner: "size-4",
    title: "text-base",
    subtitle: "text-xs",
  },
  lg: {
    icon: "size-11 rounded-xl",
    iconInner: "size-5",
    title: "text-lg",
    subtitle: "text-xs",
  },
} as const;

export function BrandLogo({
  className,
  showSubtitle = false,
  size = "md",
}: BrandLogoProps) {
  const styles = sizeStyles[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex items-center justify-center bg-primary text-primary-foreground shadow-sm",
          styles.icon,
        )}
        aria-hidden="true"
      >
        <PawPrint className={styles.iconInner} />
      </div>
      <div className="leading-tight">
        <p className={cn("font-semibold tracking-tight text-foreground", styles.title)}>
          {brand.name}
        </p>
        {showSubtitle ? (
          <p className={cn("text-muted-foreground", styles.subtitle)}>{brand.tagline}</p>
        ) : null}
      </div>
    </div>
  );
}
