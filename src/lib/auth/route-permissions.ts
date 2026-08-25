import type { Permission } from "@/lib/auth/permissions";

export type RoutePermissionRule = {
  prefix: string;
  permission: Permission;
  /** Rotas filhas que exigem permissão adicional (prefixo mais longo primeiro). */
};

const ROUTE_RULES: RoutePermissionRule[] = [
  { prefix: "/dashboard/relatorios", permission: "reports.view" },
  { prefix: "/dashboard/estoque", permission: "inventory.view" },
  { prefix: "/dashboard/pdv/caixa", permission: "pos.close_cash" },
  { prefix: "/dashboard/pdv", permission: "pos.use" },
  { prefix: "/dashboard/financeiro", permission: "finance.view" },
  { prefix: "/dashboard/configuracoes", permission: "settings.view" },
  { prefix: "/dashboard/funcionarios", permission: "employees.view" },
  { prefix: "/dashboard/servicos", permission: "services.view" },
  { prefix: "/dashboard/atendimentos", permission: "service_orders.view" },
  { prefix: "/dashboard/agenda", permission: "appointments.view" },
  { prefix: "/dashboard/pets", permission: "pets.view" },
  { prefix: "/dashboard/tutores", permission: "customers.view" },
  { prefix: "/dashboard", permission: "dashboard.view" },
  { prefix: "/notificacoes", permission: "dashboard.view" },
  { prefix: "/assinatura", permission: "subscription.view" },
];

const ADJUSTMENT_ROUTE = "/dashboard/estoque";
const ADJUSTMENT_SUFFIX = "/ajuste";

export function getRequiredPermissionForPath(pathname: string): Permission | null {
  const normalized = pathname.split("?")[0] ?? pathname;

  if (
    normalized.includes(ADJUSTMENT_SUFFIX) &&
    normalized.startsWith(ADJUSTMENT_ROUTE)
  ) {
    return "inventory.adjust";
  }

  for (const rule of ROUTE_RULES) {
    if (rule.prefix === "/dashboard") {
      if (normalized === "/dashboard" || normalized === "/dashboard/") {
        return rule.permission;
      }
      continue;
    }

    if (normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`)) {
      return rule.permission;
    }
  }

  return null;
}

export function navItemRequiresPermission(href: string): Permission | null {
  return getRequiredPermissionForPath(href);
}
