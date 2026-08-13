"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Shield } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/shared/brand-logo";
import {
  getInitials,
  useDashboardUser,
} from "@/components/layout/dashboard-user-provider";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { dashboardNavItems } from "@/config/navigation";
import { cn } from "@/lib/utils";

export function DashboardMobileNav() {
  const pathname = usePathname();
  const { profile, membership, isPlatformAdmin } = useDashboardUser();
  const initials = getInitials(profile.fullName);
  const adminActive = pathname.startsWith("/admin");

  return (
    <Sheet>
      <SheetTrigger
        aria-label="Abrir menu de navegação"
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "lg:hidden",
        )}
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent side="left" className="flex w-80 flex-col p-0">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <BrandLogo size="sm" />
        </SheetHeader>
        <nav className="flex flex-1 flex-col gap-1 p-4" aria-label="Menu mobile do dashboard">
          {dashboardNavItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/80 hover:bg-muted",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}

          {isPlatformAdmin ? (
            <Link
              href="/admin"
              aria-current={adminActive ? "page" : undefined}
              className={cn(
                "mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                adminActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/80 hover:bg-muted",
              )}
            >
              <Shield className="size-4 shrink-0" aria-hidden="true" />
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="mt-auto space-y-3 border-t p-4">
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
            <Avatar size="sm">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{profile.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {membership.company.name}
              </p>
            </div>
          </div>
          <LogoutButton className="w-full gap-2" label="Sair da conta" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
