"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { NewPasswordForm } from "@/components/auth/new-password-form";
import {
  getRoleLabel,
  useDashboardUser,
} from "@/components/layout/dashboard-user-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RestartOnboardingTourCard } from "@/features/onboarding-tour/components/restart-onboarding-tour-card";

type ProfileSettingsContentProps = {
  automaticMessages?: ReactNode;
};

export function ProfileSettingsContent({
  automaticMessages,
}: ProfileSettingsContentProps) {
  const { user, profile, membership } = useDashboardUser();

  return (
    <main className="flex-1 space-y-6 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Informações da sua conta no PetGestor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Nome</span>
            <span className="font-medium">{profile.fullName}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">E-mail</span>
            <span className="font-medium">{user.email ?? "Não informado"}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Pet shop</span>
            <span className="font-medium">{membership.company.name}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Papel</span>
            <Badge variant="secondary">{getRoleLabel(membership.role)}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>
            Defina uma nova senha para sua conta autenticada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewPasswordForm
            embedded
            redirectTo="/dashboard/configuracoes?senha-atualizada=1"
          />
        </CardContent>
      </Card>

      <RestartOnboardingTourCard />

      {automaticMessages}

      <p className="text-sm text-muted-foreground">
        Esqueceu a senha atual?{" "}
        <Link
          href="/recuperar-senha"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Solicitar recuperação por e-mail
        </Link>
      </p>
    </main>
  );
}
