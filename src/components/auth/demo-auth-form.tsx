"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
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

type DemoAuthFormProps = {
  mode: "login" | "signup";
  title: string;
  description: string;
  submitLabel: string;
  alternateText: string;
  alternateHref: string;
  alternateLinkLabel: string;
  footerNote: ReactNode;
};

export function DemoAuthForm({
  mode,
  title,
  description,
  submitLabel,
  alternateText,
  alternateHref,
  alternateLinkLabel,
  footerNote,
}: DemoAuthFormProps) {
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/dashboard");
  }

  return (
    <Card className="border bg-card/95 shadow-lg backdrop-blur-sm">
      <CardHeader className="space-y-1 text-center sm:text-left">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {mode === "signup" ? (
            <div className="space-y-2">
              <Label htmlFor="shop-name">Nome do pet shop</Label>
              <Input
                id="shop-name"
                name="shop-name"
                placeholder="Ex.: Pet Shop Amigo Fiel"
                autoComplete="organization"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {mode === "signup" ? (
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input
                id="confirm-password"
                name="confirm-password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          ) : null}

          <Button type="submit" className="h-10 w-full">
            {submitLabel}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-4 border-t bg-muted/20 pt-6">
        <p className="text-center text-sm text-muted-foreground">
          {alternateText}{" "}
          <Link
            href={alternateHref}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {alternateLinkLabel}
          </Link>
        </p>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          {footerNote}
        </p>
        <ButtonLink href="/dashboard" variant="outline" className="w-full">
          Explorar dashboard demonstrativo
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}
