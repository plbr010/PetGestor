"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DashboardContext } from "@/features/auth/types";

export type DashboardShellContext = DashboardContext & {
  isPlatformAdmin: boolean;
};

const DashboardUserContext = createContext<DashboardShellContext | null>(null);

type DashboardUserProviderProps = {
  value: DashboardShellContext;
  children: ReactNode;
};

export function DashboardUserProvider({ value, children }: DashboardUserProviderProps) {
  return (
    <DashboardUserContext.Provider value={value}>{children}</DashboardUserContext.Provider>
  );
}

export function useDashboardUser(): DashboardShellContext {
  const context = useContext(DashboardUserContext);

  if (!context) {
    throw new Error("useDashboardUser deve ser usado dentro de DashboardUserProvider.");
  }

  return context;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "PG";
  }

  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function getRoleLabel(role: DashboardContext["membership"]["role"]): string {
  switch (role) {
    case "owner":
      return "Proprietário";
    case "admin":
      return "Administrador";
    case "staff":
      return "Equipe";
    default:
      return "Membro";
  }
}
