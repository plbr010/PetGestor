import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import { brand } from "@/config/brand";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <EmptyState
        title="Página não encontrada"
        description="O endereço acessado não existe ou ainda não foi implementado."
        className="max-w-lg border-none bg-transparent"
      />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <ButtonLink href="/">Voltar para {brand.name}</ButtonLink>
        <ButtonLink href="/dashboard" variant="outline">
          Ver demonstração
        </ButtonLink>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Precisa de ajuda?{" "}
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Acesse a área de login
        </Link>
      </p>
    </main>
  );
}
