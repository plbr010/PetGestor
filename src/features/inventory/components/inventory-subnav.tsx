import Link from "next/link";

const ITEMS = [
  { href: "/dashboard/estoque", label: "Produtos" },
  { href: "/dashboard/estoque/movimentacoes", label: "Movimentações" },
  { href: "/dashboard/estoque/fornecedores", label: "Fornecedores" },
  { href: "/dashboard/estoque/categorias", label: "Categorias" },
] as const;

type InventorySubnavProps = {
  current: "produtos" | "movimentacoes" | "fornecedores" | "categorias";
};

export function InventorySubnav({ current }: InventorySubnavProps) {
  const activeHref = {
    produtos: "/dashboard/estoque",
    movimentacoes: "/dashboard/estoque/movimentacoes",
    fornecedores: "/dashboard/estoque/fornecedores",
    categorias: "/dashboard/estoque/categorias",
  }[current];

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Seções de estoque">
      {ITEMS.map((item) => {
        const isActive = item.href === activeHref;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted/30"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
