"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { signUpAction, type AuthActionState } from "@/features/auth/actions";
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
import { formatPhoneInput } from "@/lib/phone";

const initialState: AuthActionState = {};

type SignUpFormProps = {
  mode?: "owner" | "staff";
};

export function SignUpForm({ mode = "owner" }: SignUpFormProps) {
  const [state, formAction, isPending] = useActionState(signUpAction, initialState);
  const [phone, setPhone] = useState("");
  const isStaff = mode === "staff";

  return (
    <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
      <CardHeader className="space-y-1 text-center sm:text-left">
        <CardTitle className="text-2xl">
          {isStaff ? "Criar conta de funcionário" : "Comece seu teste gratuito"}
        </CardTitle>
        <CardDescription>
          {isStaff
            ? "Use o mesmo e-mail do convite para entrar na empresa que te convidou. Nenhuma empresa nova será criada."
            : "Crie sua conta e configure seu pet shop em poucos minutos."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" action={formAction} noValidate>
          <input type="hidden" name="mode" value={isStaff ? "staff" : "owner"} />

          {state.error ? <ErrorMessage message={state.error} /> : null}

          <div className="space-y-2">
            <Label htmlFor="fullName">Seu nome</Label>
            <Input
              id="fullName"
              name="fullName"
              placeholder="Ex.: Ana Silva"
              autoComplete="name"
              required
            />
          </div>

          {isStaff ? null : (
            <>
              <div className="space-y-2">
                <Label htmlFor="companyName">Nome do pet shop</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  placeholder="Ex.: Pet Shop Amigo Fiel"
                  autoComplete="organization"
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
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={isStaff ? "e-mail do convite" : "seu@email.com"}
              autoComplete="email"
              required
            />
            {isStaff ? (
              <p className="text-xs text-muted-foreground">
                Precisa ser exatamente o e-mail informado pelo administrador no convite.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
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
              required
            />
          </div>

          <Button type="submit" className="h-10 w-full" disabled={isPending}>
            {isPending
              ? "Criando conta..."
              : isStaff
                ? "Criar conta e continuar"
                : "Criar conta"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-4 border-t bg-muted/20 pt-6">
        <p className="text-center text-sm text-muted-foreground">
          {isStaff ? (
            <>
              Já possui conta?{" "}
              <Link
                href="/entrar"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Entrar
              </Link>
            </>
          ) : (
            <>
              Já possui conta?{" "}
              <Link
                href="/entrar"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Entrar
              </Link>
              {" · "}
              Foi convidado?{" "}
              <Link
                href="/cadastro?modo=funcionario"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Cadastro de funcionário
              </Link>
            </>
          )}
        </p>
      </CardFooter>
    </Card>
  );
}
