import {
  ACCESS_PROFILE_LABELS,
  getProfilePermissions,
  type AccessProfile,
  type Permission,
} from "@/lib/auth/permissions";

const PERMISSION_SHORT_LABELS: Partial<Record<Permission, string>> = {
  "customers.view": "Clientes",
  "pets.view": "Pets",
  "appointments.view": "Agenda",
  "service_orders.view": "Atendimentos",
  "finance.view": "Financeiro",
  "inventory.view": "Estoque",
  "pos.use": "PDV",
  "reports.view": "Relatórios",
};

const HIGHLIGHT_ORDER: Permission[] = [
  "customers.view",
  "pets.view",
  "appointments.view",
  "service_orders.view",
  "finance.view",
  "inventory.view",
  "pos.use",
  "reports.view",
];

export function getAccessProfileLabel(profile: string): string {
  if (profile in ACCESS_PROFILE_LABELS) {
    return ACCESS_PROFILE_LABELS[profile as AccessProfile];
  }
  return profile || "Funcionário";
}

/** Resumo curto e seguro das capacidades do perfil (sem expor chaves técnicas). */
export function getAccessProfileHighlights(profile: string): string[] {
  if (!(profile in ACCESS_PROFILE_LABELS) || profile === "owner_admin") {
    return [];
  }

  const permissions = new Set(getProfilePermissions(profile as AccessProfile));
  return HIGHLIGHT_ORDER.filter((key) => permissions.has(key))
    .map((key) => PERMISSION_SHORT_LABELS[key])
    .filter((label): label is string => Boolean(label))
    .slice(0, 4);
}
