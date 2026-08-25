import Link from "next/link";

import { cn } from "@/lib/utils";

const items = [
  { key: "pdv", href: "/dashboard/pdv", label: "Nova venda" },
  { key: "vendas", href: "/dashboard/pdv/vendas", label: "Histórico" },
  { key: "caixa", href: "/dashboard/pdv/caixa", label: "Caixa" },
] as const;

export function PosSubnav({ current }: { current: (typeof items)[number]["key"] }) {
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center rounded-lg border px-4 text-sm font-medium transition-colors",
            current === item.key
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
