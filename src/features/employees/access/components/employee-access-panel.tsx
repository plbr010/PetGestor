"use client";

import { useActionState, useMemo, useState } from "react";

import {
  grantEmployeeAccessAction,
  revokeEmployeeAccessAction,
  updateEmployeeAccessAction,
  type EmployeeAccessActionState,
} from "@/features/employees/access/actions";
import type { EmployeeAccessState } from "@/features/employees/access/queries";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ACCESS_PROFILE_LABELS,
  ASSIGNABLE_ACCESS_PROFILES,
  getProfilePermissions,
  PERMISSION_GROUPS,
  type AccessProfile,
  type Permission,
} from "@/lib/auth/permissions";

type EmployeeAccessPanelProps = {
  employeeId: string;
  employeeEmail: string | null;
  access: EmployeeAccessState;
};

const INITIAL_STATE: EmployeeAccessActionState = {};

function PermissionGroupCard({
  profile,
  selected,
  onToggle,
}: {
  profile: AccessProfile;
  selected: Set<Permission>;
  onToggle: (permission: Permission, checked: boolean) => void;
}) {
  const profileDefaults = useMemo(() => new Set(getProfilePermissions(profile)), [profile]);

  return (
    <div className="space-y-3">
      {PERMISSION_GROUPS.map((group) => (
        <details
          key={group.id}
          className="group rounded-xl border bg-background/80"
          open={group.id === "customers" || group.id === "appointments"}
        >
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
            <span className="flex items-center justify-between gap-2">
              {group.label}
              <span className="text-xs font-normal text-muted-foreground group-open:hidden">
                Expandir
              </span>
            </span>
          </summary>
          <div className="space-y-2 border-t px-4 py-3">
            {group.permissions.map((permission) => {
              const checked = selected.has(permission.key);
              const isProfileDefault = profileDefaults.has(permission.key);

              return (
                <div
                  key={permission.key}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-muted/40"
                >
                  <span className="text-sm">
                    {permission.label}
                    {isProfileDefault ? (
                      <span className="ml-2 text-xs text-muted-foreground">(perfil)</span>
                    ) : null}
                  </span>
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={checked}
                    onChange={(event) => onToggle(permission.key, event.target.checked)}
                    aria-label={permission.label}
                  />
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

function AccessStatusBanner({ access }: { access: EmployeeAccessState }) {
  if (access.hasAccess) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
        <p className="font-medium text-emerald-800 dark:text-emerald-200">Ativo</p>
        <p className="text-muted-foreground">
          Acesso liberado
          {access.linkedEmail ? ` — ${access.linkedEmail}` : ""}
          {access.accessProfile
            ? ` · Perfil ${ACCESS_PROFILE_LABELS[access.accessProfile]}`
            : ""}
        </p>
      </div>
    );
  }

  if (access.pendingInvite?.isExpired) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <p className="font-medium">Convite expirado</p>
        <p className="text-muted-foreground">
          O convite para <strong>{access.pendingInvite.email}</strong> expirou. Crie um novo
          convite para liberar o acesso.
        </p>
      </div>
    );
  }

  if (access.pendingInvite) {
    const expiresLabel = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(access.pendingInvite.expiresAt));

    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
        <p className="font-medium text-amber-900 dark:text-amber-100">Convite pendente</p>
        <p className="text-muted-foreground">
          Convite para <strong>{access.pendingInvite.email}</strong> · válido até {expiresLabel}.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Envio automático de e-mail ainda não configurado. Peça ao funcionário para criar conta
          em <strong>/cadastro</strong> e escolher “Sou funcionário”, ou entrar se já tiver
          conta.
        </p>
      </div>
    );
  }

  if (access.accessRevokedAt) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <p className="font-medium">Acesso removido</p>
        <p className="text-muted-foreground">
          O histórico do funcionário foi preservado. Você pode conceder acesso novamente.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      Sem acesso ao PetGestor
    </div>
  );
}

export function EmployeeAccessPanel({
  employeeId,
  employeeEmail,
  access,
}: EmployeeAccessPanelProps) {
  const initialProfile =
    access.accessProfile && access.accessProfile !== "owner_admin"
      ? access.accessProfile
      : access.pendingInvite?.accessProfile && access.pendingInvite.accessProfile !== "owner_admin"
        ? access.pendingInvite.accessProfile
        : "reception";

  const [profile, setProfile] = useState<AccessProfile>(initialProfile);
  const [email, setEmail] = useState(
    access.linkedEmail ?? access.pendingInvite?.email ?? employeeEmail ?? "",
  );
  const [ownScheduleOnly, setOwnScheduleOnly] = useState(access.ownScheduleOnly);
  const [selected, setSelected] = useState<Set<Permission>>(
    () =>
      new Set(
        access.permissions.length > 0 ? access.permissions : getProfilePermissions(initialProfile),
      ),
  );

  const grantAction = grantEmployeeAccessAction.bind(null, employeeId);
  const updateAction = updateEmployeeAccessAction.bind(null, employeeId);

  const [grantState, grantFormAction, grantPending] = useActionState(
    access.hasAccess ? updateAction : grantAction,
    INITIAL_STATE,
  );

  const [revokeState, revokeFormAction, revokePending] = useActionState(
    async () => revokeEmployeeAccessAction(employeeId),
    INITIAL_STATE,
  );

  const feedback = grantState.error
    ? { variant: "error" as const, message: grantState.error }
    : grantState.success
      ? { variant: "success" as const, message: grantState.success }
      : revokeState.error
        ? { variant: "error" as const, message: revokeState.error }
        : revokeState.success
          ? { variant: "success" as const, message: revokeState.success }
          : null;

  function handleProfileChange(nextProfile: AccessProfile) {
    setProfile(nextProfile);
    setSelected(new Set(getProfilePermissions(nextProfile)));
  }

  function handleToggle(permission: Permission, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(permission);
      } else {
        next.delete(permission);
      }
      return next;
    });
  }

  const hasPendingInvite = Boolean(access.pendingInvite && !access.pendingInvite.isExpired);
  const showEmailField = !access.hasAccess;
  const submitLabel = access.hasAccess
    ? "Salvar permissões"
    : hasPendingInvite
      ? "Atualizar / reenviar convite"
      : "Dar acesso ao PetGestor";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acesso ao sistema</CardTitle>
        <CardDescription>
          Defina perfil e permissões para este funcionário usar o PetGestor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {feedback ? <FormFeedback message={feedback.message} variant={feedback.variant} /> : null}

        <AccessStatusBanner access={access} />

        <form action={grantFormAction} className="space-y-5">
          {showEmailField ? (
            <div className="space-y-2">
              <Label htmlFor="employee-access-email">E-mail de acesso</Label>
              <Input
                id="employee-access-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="funcionario@email.com"
              />
              <p className="text-xs text-muted-foreground">
                Não criamos senha manualmente — o funcionário entra com a própria conta.
              </p>
            </div>
          ) : (
            <input type="hidden" name="email" value={email} />
          )}

          <div className="space-y-2">
            <Label htmlFor="employee-access-profile">Perfil</Label>
            <select
              id="employee-access-profile"
              name="accessProfile"
              className="flex h-11 w-full rounded-xl border bg-background px-3 text-sm"
              value={profile}
              onChange={(event) => handleProfileChange(event.target.value as AccessProfile)}
            >
              {ASSIGNABLE_ACCESS_PROFILES.map((item) => (
                <option key={item} value={item}>
                  {ACCESS_PROFILE_LABELS[item]}
                </option>
              ))}
            </select>
          </div>

          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Ver somente meus atendimentos</p>
              <p className="text-xs text-muted-foreground">
                Restringe agenda e atendimentos ao funcionário vinculado.
              </p>
            </div>
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-primary"
              checked={ownScheduleOnly}
              onChange={(event) => setOwnScheduleOnly(event.target.checked)}
              aria-label="Ver somente meus atendimentos"
            />
            <input
              type="hidden"
              name="ownScheduleOnly"
              value={ownScheduleOnly ? "on" : "off"}
            />
          </label>

          {Array.from(selected).map((permission) => (
            <input key={permission} type="hidden" name="permissions" value={permission} />
          ))}

          <div className="space-y-2">
            <p className="text-sm font-medium">Permissões</p>
            <PermissionGroupCard
              profile={profile}
              selected={selected}
              onToggle={handleToggle}
            />
          </div>

          <Button type="submit" disabled={grantPending} className="w-full sm:w-auto">
            {submitLabel}
          </Button>
        </form>

        {access.hasAccess || hasPendingInvite || access.pendingInvite?.isExpired ? (
          <form action={revokeFormAction}>
            <Button
              type="submit"
              variant="destructive"
              disabled={revokePending}
              className="w-full sm:w-auto"
            >
              Remover acesso ao sistema
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
