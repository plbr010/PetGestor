/**
 * Permissões granulares por módulo/ação (por empresa via company_members).
 */

export const PERMISSIONS = [
  "dashboard.view",
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.archive",
  "pets.view",
  "pets.create",
  "pets.edit",
  "appointments.view",
  "appointments.create",
  "appointments.edit",
  "appointments.cancel",
  "service_orders.view",
  "service_orders.update_status",
  "services.view",
  "services.manage",
  "employees.view",
  "employees.manage",
  "finance.view",
  "finance.create",
  "finance.edit",
  "finance.close_cash",
  "inventory.view",
  "inventory.manage",
  "inventory.adjust",
  "pos.use",
  "pos.cancel_sale",
  "pos.apply_discount",
  "pos.receive_payment",
  "pos.close_cash",
  "reports.view",
  "settings.view",
  "settings.manage",
  "subscription.view",
  "subscription.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ACCESS_PROFILES = [
  "owner_admin",
  "manager",
  "reception",
  "operational",
  "finance",
  "inventory_cash",
] as const;

export type AccessProfile = (typeof ACCESS_PROFILES)[number];

export type PermissionGroup = {
  id: string;
  label: string;
  permissions: Array<{
    key: Permission;
    label: string;
  }>;
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "dashboard",
    label: "Início",
    permissions: [{ key: "dashboard.view", label: "Visualizar" }],
  },
  {
    id: "customers",
    label: "Clientes e pets",
    permissions: [
      { key: "customers.view", label: "Visualizar clientes" },
      { key: "customers.create", label: "Cadastrar clientes" },
      { key: "customers.edit", label: "Editar clientes" },
      { key: "customers.archive", label: "Arquivar clientes" },
      { key: "pets.view", label: "Visualizar pets" },
      { key: "pets.create", label: "Cadastrar pets" },
      { key: "pets.edit", label: "Editar pets" },
    ],
  },
  {
    id: "appointments",
    label: "Agenda",
    permissions: [
      { key: "appointments.view", label: "Visualizar" },
      { key: "appointments.create", label: "Criar" },
      { key: "appointments.edit", label: "Editar" },
      { key: "appointments.cancel", label: "Cancelar" },
    ],
  },
  {
    id: "service_orders",
    label: "Atendimentos",
    permissions: [
      { key: "service_orders.view", label: "Visualizar" },
      { key: "service_orders.update_status", label: "Atualizar status" },
    ],
  },
  {
    id: "services",
    label: "Serviços",
    permissions: [
      { key: "services.view", label: "Visualizar" },
      { key: "services.manage", label: "Gerenciar" },
    ],
  },
  {
    id: "employees",
    label: "Funcionários",
    permissions: [
      { key: "employees.view", label: "Visualizar" },
      { key: "employees.manage", label: "Gerenciar" },
    ],
  },
  {
    id: "finance",
    label: "Financeiro",
    permissions: [
      { key: "finance.view", label: "Visualizar" },
      { key: "finance.create", label: "Registrar lançamentos" },
      { key: "finance.edit", label: "Alterar/cancelar" },
      { key: "finance.close_cash", label: "Fechar caixa" },
    ],
  },
  {
    id: "inventory",
    label: "Estoque",
    permissions: [
      { key: "inventory.view", label: "Visualizar" },
      { key: "inventory.manage", label: "Entradas e saídas" },
      { key: "inventory.adjust", label: "Ajuste manual" },
    ],
  },
  {
    id: "pos",
    label: "PDV",
    permissions: [
      { key: "pos.use", label: "Usar" },
      { key: "pos.apply_discount", label: "Aplicar desconto" },
      { key: "pos.receive_payment", label: "Receber pagamento" },
      { key: "pos.cancel_sale", label: "Cancelar venda" },
      { key: "pos.close_cash", label: "Abrir/fechar caixa" },
    ],
  },
  {
    id: "reports",
    label: "Relatórios",
    permissions: [{ key: "reports.view", label: "Visualizar" }],
  },
  {
    id: "settings",
    label: "Configurações",
    permissions: [
      { key: "settings.view", label: "Acessar" },
      { key: "settings.manage", label: "Alterar" },
    ],
  },
  {
    id: "subscription",
    label: "Assinatura",
    permissions: [
      { key: "subscription.view", label: "Visualizar" },
      { key: "subscription.manage", label: "Gerenciar" },
    ],
  },
];

const PROFILE_PERMISSIONS: Record<AccessProfile, readonly Permission[]> = {
  owner_admin: PERMISSIONS,
  manager: [
    "dashboard.view",
    "customers.view",
    "customers.create",
    "customers.edit",
    "customers.archive",
    "pets.view",
    "pets.create",
    "pets.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "appointments.cancel",
    "service_orders.view",
    "service_orders.update_status",
    "services.view",
    "services.manage",
    "employees.view",
    "employees.manage",
    "finance.view",
    "finance.create",
    "finance.edit",
    "inventory.view",
    "inventory.manage",
    "inventory.adjust",
    "pos.use",
    "pos.apply_discount",
    "pos.cancel_sale",
    "pos.receive_payment",
    "pos.close_cash",
    "reports.view",
    "settings.view",
  ],
  reception: [
    "dashboard.view",
    "customers.view",
    "customers.create",
    "customers.edit",
    "pets.view",
    "pets.create",
    "pets.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "service_orders.view",
    "service_orders.update_status",
    "services.view",
    "finance.create",
    "pos.use",
    "pos.receive_payment",
  ],
  operational: [
    "dashboard.view",
    "pets.view",
    "appointments.view",
    "service_orders.view",
    "service_orders.update_status",
  ],
  finance: [
    "dashboard.view",
    "finance.view",
    "finance.create",
    "finance.edit",
    "finance.close_cash",
    "reports.view",
    "pos.use",
    "pos.receive_payment",
    "pos.close_cash",
  ],
  inventory_cash: [
    "dashboard.view",
    "inventory.view",
    "inventory.manage",
    "pos.use",
    "pos.receive_payment",
    "finance.close_cash",
    "pos.close_cash",
  ],
};

export const ACCESS_PROFILE_LABELS: Record<AccessProfile, string> = {
  owner_admin: "Dono / Admin",
  manager: "Gerente",
  reception: "Recepção",
  operational: "Operacional",
  finance: "Financeiro",
  inventory_cash: "Estoque / Caixa",
};

/** Perfis atribuíveis a funcionários (sem owner_admin). */
export const ASSIGNABLE_ACCESS_PROFILES = ACCESS_PROFILES.filter(
  (profile) => profile !== "owner_admin",
);

export function isAccessProfile(value: string): value is AccessProfile {
  return (ACCESS_PROFILES as readonly string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function getProfilePermissions(profile: AccessProfile): Permission[] {
  return [...PROFILE_PERMISSIONS[profile]];
}

export function permissionsFromProfile(profile: AccessProfile): Permission[] {
  return getProfilePermissions(profile);
}

export function mergePermissionsWithProfile(
  profile: AccessProfile,
  customPermissions: Permission[],
): Permission[] {
  const base = new Set(getProfilePermissions(profile));
  for (const permission of customPermissions) {
    base.add(permission);
  }
  return PERMISSIONS.filter((permission) => base.has(permission));
}

export function diffPermissionsFromProfile(
  profile: AccessProfile,
  selected: Permission[],
): Permission[] {
  const base = new Set(getProfilePermissions(profile));
  return selected.filter((permission) => !base.has(permission));
}

export function normalizeStoredPermissions(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((item): item is Permission => typeof item === "string" && isPermission(item));
}

export type MembershipAccess = {
  role: "owner" | "admin" | "staff";
  accessProfile: AccessProfile | null;
  permissions: Permission[];
  accessRevokedAt: string | null;
  employeeId: string | null;
  ownScheduleOnly: boolean;
};

export function isOwnerOrAdmin(membership: Pick<MembershipAccess, "role">): boolean {
  return membership.role === "owner" || membership.role === "admin";
}

export function hasActiveAccess(membership: Pick<MembershipAccess, "accessRevokedAt">): boolean {
  return membership.accessRevokedAt === null;
}

/** Permissões efetivas: owner/admin sempre total; demais usam JSON persistido. */
export function resolveEffectivePermissions(membership: MembershipAccess): Set<Permission> {
  if (!hasActiveAccess(membership)) {
    return new Set();
  }

  if (isOwnerOrAdmin(membership)) {
    return new Set(PERMISSIONS);
  }

  if (membership.permissions.length > 0) {
    return new Set(membership.permissions);
  }

  const profile = membership.accessProfile ?? "reception";
  return new Set(getProfilePermissions(profile));
}

export function hasPermission(membership: MembershipAccess, permission: Permission): boolean {
  return resolveEffectivePermissions(membership).has(permission);
}

export function hasAnyPermission(
  membership: MembershipAccess,
  permissions: Permission[],
): boolean {
  const effective = resolveEffectivePermissions(membership);
  return permissions.some((permission) => effective.has(permission));
}

export function hasAllPermissions(
  membership: MembershipAccess,
  permissions: Permission[],
): boolean {
  const effective = resolveEffectivePermissions(membership);
  return permissions.every((permission) => effective.has(permission));
}

/** Dono principal não pode perder administração. */
export function canModifyMemberAccess(
  actor: { userId: string; membership: MembershipAccess },
  target: { userId: string; role: "owner" | "admin" | "staff" },
): boolean {
  if (!isOwnerOrAdmin(actor.membership)) {
    return false;
  }

  if (target.role === "owner") {
    return false;
  }

  return true;
}

export function getScheduleEmployeeFilter(
  membership: MembershipAccess,
): string | undefined {
  if (!hasActiveAccess(membership)) {
    return undefined;
  }

  if (isOwnerOrAdmin(membership)) {
    return undefined;
  }

  if (membership.ownScheduleOnly && membership.employeeId) {
    return membership.employeeId;
  }

  return undefined;
}

export function buildPermissionsPayload(
  profile: AccessProfile,
  selected: Permission[],
): Permission[] {
  if (profile === "owner_admin") {
    return [...PERMISSIONS];
  }

  return mergePermissionsWithProfile(profile, selected);
}

export function permissionsToJson(permissions: Permission[]): string[] {
  return PERMISSIONS.filter((permission) => permissions.includes(permission));
}
