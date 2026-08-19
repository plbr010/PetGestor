"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard/relatorios", label: "Visão geral" },
  { href: "/dashboard/relatorios/atendimentos", label: "Atendimentos" },
  { href: "/dashboard/relatorios/clientes", label: "Clientes" },
  { href: "/dashboard/relatorios/equipe", label: "Equipe" },
  { href: "/dashboard/relatorios/pdv", label: "PDV" },
  { href: "/dashboard/relatorios/estoque", label: "Estoque" },
];

export function ReportSubnav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1 border-b">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
