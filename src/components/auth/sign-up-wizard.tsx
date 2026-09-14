"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, UserRound } from "lucide-react";

import { signUpAction, type AuthActionState } from "@/features/auth/actions";
import { AUTH_FIELD_LIMITS } from "@/features/auth/schemas";
import { trackMetaSignupStarted } from "@/lib/analytics/meta-pixel";
import { lookupPendingInviteByEmailAction } from "@/features/employees/access/lookup-invite";
import { ErrorMessage } from "@/components/shared/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatTrialNote } from "@/config/subscription";
import { formatPhoneInput } from "@/lib/phone";
import { cn } from "@/lib/utils";

const initialState: AuthActionState = {};

type WizardStep = "choice" | "owner-form" | "staff-email" | "staff-form";

type SignUpWizardProps = {
  initialStep?: WizardStep;
  initialEmail?: string;
};

export function SignUpWizard({
  initialStep = "choice",
  initialEmail = "",
}: SignUpWizardProps) {
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [email, setEmail] = useState(initialEmail);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupPending, startLookup] = useTransition();
  const [phone, setPhone] = useState("");
  const [ownerState, ownerAction, ownerPending] = useActionState(signUpAction, initialState);
  const [staffState, staffAction, staffPending] = useActionState(signUpAction, initialState);

  function goChoice() {
    setStep("choice");
    setLookupError(null);
  }

  function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookupError(null);

    startLookup(async () => {
      const result = await lookupPendingInviteByEmailAction(email);

      if (!result.ok) {
        setLookupError(result.error);
        return;
      }

      setEmail(result.email);
      setStep("staff-form");
    });
  }

  if (step === "choice") {
    return (
      <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl">Como você vai usar o PetGestor?</CardTitle>
          <CardDescription>Escolha a opção que melhor descreve você.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            type="button"
            onClick={() => {
              trackMetaSignupStarted();
              setStep("owner-form");
            }}
            className={cn(
              "flex w-full flex-col gap-1 rounded-2xl border bg-background px-4 py-4 text-left transition-colors",
              "hover:border-primary/40 hover:bg-primary/5",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            )}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <BriefcaseBusiness className="size-5 text-primary" aria-hidden="true" />
              Sou dono ou gestor
            </span>
            <span className="text-sm text-muted-foreground">
              Quero administrar meu pet shop. {formatTrialNote()}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("staff-email")}
            className={cn(
              "flex w-full flex-col gap-1 rounded-2xl border bg-background px-4 py-4 text-left transition-colors",
              "hover:border-primary/40 hover:bg-primary/5",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            )}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <UserRound className="size-5 text-primary" aria-hidden="true" />
              Sou funcionário
            </span>
            <span className="text-sm text-muted-foreground">
              Trabalho em um pet shop e recebi ou vou receber um convite
            </span>
          </button>
        </CardContent>
        <CardFooter className="justify-center border-t bg-muted/20 pt-6">
          <p className="text-sm text-muted-foreground">
            Já tenho uma conta?{" "}
            <Link
              href="/entrar"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Entrar
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  if (step === "staff-email") {
    return (
      <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
        <CardHeader className="space-y-2">
          <button
            type="button"
            onClick={goChoice}
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar
          </button>
          <CardTitle className="text-2xl">Entrar como funcionário</CardTitle>
          <CardDescription>
            Para entrar em um pet shop, você precisa receber um convite do administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleLookup} noValidate>
            {!lookupPending && lookupError ? <ErrorMessage message={lookupError} /> : null}

            <div className="space-y-2">
              <Label htmlFor="invite-email">E-mail do convite</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                maxLength={AUTH_FIELD_LIMITS.email}
              />
              <p className="text-xs text-muted-foreground">
                Use exatamente o e-mail que o administrador cadastrou no convite.
              </p>
            </div>

            <Button type="submit" className="h-10 w-full" disabled={lookupPending}>
              {lookupPending ? "Continuando..." : "Continuar"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t bg-muted/20 pt-6">
          <p className="text-sm text-muted-foreground">
            Já tenho uma conta?{" "}
            <Link
              href="/entrar"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Entrar
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  if (step === "staff-form") {
    return (
      <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
        <CardHeader className="space-y-2">
          <button
            type="button"
            onClick={() => setStep("staff-email")}
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar
          </button>
          <CardTitle className="text-2xl">Criar sua conta</CardTitle>
          <CardDescription>
            Se houver um convite para este e-mail, você poderá aceitá-lo depois de criar a
            conta. Nenhuma empresa nova será criada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" action={staffAction} noValidate>
            <input type="hidden" name="mode" value="staff" />
            {!staffPending && staffState.error ? <ErrorMessage message={staffState.error} /> : null}

            <div className="space-y-2">
              <Label htmlFor="staff-fullName">Seu nome</Label>
              <Input
                id="staff-fullName"
                name="fullName"
                placeholder="Ex.: Ana Silva"
                autoComplete="name"
                maxLength={AUTH_FIELD_LIMITS.personName}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-email">E-mail</Label>
              <Input
                id="staff-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={AUTH_FIELD_LIMITS.email}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-password">Senha</Label>
              <Input
                id="staff-password"
                name="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                minLength={AUTH_FIELD_LIMITS.passwordMin}
                maxLength={AUTH_FIELD_LIMITS.password}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-confirmPassword">Confirmar senha</Label>
              <Input
                id="staff-confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Repita a senha"
                autoComplete="new-password"
                minLength={AUTH_FIELD_LIMITS.passwordMin}
                maxLength={AUTH_FIELD_LIMITS.password}
                required
              />
            </div>

            <Button type="submit" className="h-10 w-full" disabled={staffPending}>
              {staffPending ? "Criando conta..." : "Criar conta e continuar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // owner-form
  return (
    <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
      <CardHeader className="space-y-2">
        <button
          type="button"
          onClick={goChoice}
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar
        </button>
        <CardTitle className="text-2xl">Comece seu teste gratuito</CardTitle>
        <CardDescription>
          {formatTrialNote()} Crie sua conta e configure seu pet shop em poucos minutos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" action={ownerAction} noValidate>
          <input type="hidden" name="mode" value="owner" />
          {!ownerPending && ownerState.error ? <ErrorMessage message={ownerState.error} /> : null}

          <div className="space-y-2">
            <Label htmlFor="fullName">Seu nome</Label>
            <Input
              id="fullName"
              name="fullName"
              placeholder="Ex.: Ana Silva"
              autoComplete="name"
              maxLength={AUTH_FIELD_LIMITS.personName}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Nome do pet shop</Label>
            <Input
              id="companyName"
              name="companyName"
              placeholder="Ex.: Pet Shop Amigo Fiel"
              autoComplete="organization"
              maxLength={AUTH_FIELD_LIMITS.companyName}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone / WhatsApp</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="(32) 99999-9999"
              value={phone}
              onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              maxLength={AUTH_FIELD_LIMITS.email}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              minLength={AUTH_FIELD_LIMITS.passwordMin}
              maxLength={AUTH_FIELD_LIMITS.password}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar senha</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Repita a senha"
              autoComplete="new-password"
              minLength={AUTH_FIELD_LIMITS.passwordMin}
              maxLength={AUTH_FIELD_LIMITS.password}
              required
            />
          </div>

          <Button type="submit" className="h-10 w-full" disabled={ownerPending}>
            {ownerPending ? "Criando conta..." : "Criar conta"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center border-t bg-muted/20 pt-6">
        <p className="text-sm text-muted-foreground">
          Já tenho uma conta?{" "}
          <Link
            href="/entrar"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
