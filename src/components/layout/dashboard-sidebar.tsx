"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { dashboardNavItems } from "@/config/navigation";
import {
  getInitials,
  useDashboardUser,
} from "@/components/layout/dashboard-user-provider";
import { cn } from "@/lib/utils";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { profile, membership, isPlatformAdmin } = useDashboardUser();
  const initials = getInitials(profile.fullName);
  const adminActive = pathname.startsWith("/admin");

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Link
          href="/dashboard"
          className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
        >
          <BrandLogo size="sm" />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4" aria-label="Menu do dashboard">
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
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
              "mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              adminActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Shield className="size-4 shrink-0" aria-hidden="true" />
            Admin
          </Link>
        ) : null}
      </nav>

      <div className="space-y-3 border-t p-4">
        <div className="flex items-center gap-3 rounded-xl border bg-background/70 p-3">
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
        <LogoutButton className="w-full" label="Sair da conta" />
      </div>
    </aside>
  );
}
