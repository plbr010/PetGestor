"use client";

import { LogOut } from "lucide-react";

import { signOutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

type LogoutButtonProps = {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showIcon?: boolean;
  label?: string;
};

export function LogoutButton({
  variant = "outline",
  size = "default",
  className,
  showIcon = true,
  label = "Sair",
}: LogoutButtonProps) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant={variant} size={size} className={className}>
        {showIcon ? <LogOut className="size-4" aria-hidden="true" /> : null}
        {label}
      </Button>
    </form>
  );
}
