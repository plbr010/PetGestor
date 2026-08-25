"use client";

import { Plus, Search } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import {
  getInitials,
  getRoleLabel,
  useDashboardUser,
} from "@/components/layout/dashboard-user-provider";
import { NotificationBell } from "@/features/app-notifications/components/notification-bell";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type DashboardHeaderProps = {
  title: string;
  description?: string;
};

export function DashboardHeader({ title, description }: DashboardHeaderProps) {
  const { profile, membership } = useDashboardUser();
  const initials = getInitials(profile.fullName);
  const roleLabel = getRoleLabel(membership.role);

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-md">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <DashboardMobileNav />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                Olá, {profile.fullName}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                  {title}
                </h1>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {membership.company.name}
                {description ? ` · ${description}` : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ButtonLink
              href="/dashboard/agenda/novo"
              size="sm"
              className="hidden lg:inline-flex"
            >
              <Plus className="size-4" aria-hidden="true" />
              Novo agendamento
            </ButtonLink>
            <LogoutButton size="sm" variant="outline" className="gap-2" label="Sair" />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="h-10 pl-9"
              placeholder="Buscar tutores, pets ou serviços..."
              aria-label="Buscar tutores, pets ou serviços"
              disabled
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <NotificationBell />
            <div className="hidden items-center gap-2 rounded-xl border bg-card px-2 py-1.5 sm:flex">
              <Avatar size="sm">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block">
                <p className="text-sm font-medium leading-none">{profile.fullName}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
            <ButtonLink href="/dashboard/agenda/novo" size="sm" className="lg:hidden">
              <Plus className="size-4" aria-hidden="true" />
              Novo
            </ButtonLink>
          </div>
        </div>
      </div>
    </header>
  );
}
