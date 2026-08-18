import Link from "next/link";
import { Plus } from "lucide-react";

import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { ProductFiltersNav } from "@/features/inventory/components/product-filters-nav";
import { StockStatusBadge } from "@/features/inventory/components/stock-status-badge";
import { ensureDefaultProductCategories, getProductCategories, getProducts } from "@/features/inventory/queries";
import { formatQuantity } from "@/features/inventory/stock-engine";
import { parseArchiveFilter, parseStockFilter } from "@/features/inventory/filters";
import { PRODUCT_UNIT_SHORT_LABELS } from "@/features/inventory/units";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { parsePageParam } from "@/lib/pagination";
import { formatCentsToBRL } from "@/lib/money";
import { getTodayInTimezone } from "@/lib/timezone";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  ClearSearchLink,
  PaginationNav,
  SearchForm,
} from "@/components/shared/pagination-nav";
import { FormFeedback } from "@/components/shared/form-feedback";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";

type ProductsPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    category?: string;
    archive?: string;
    stock?: string;
    arquivado?: string;
  }>;
};

export default async function InventoryProductsPage({ searchParams }: ProductsPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const companyId = context.membership.company.id;
  const today = getTodayInTimezone(context.membership.company.timezone);
  await ensureDefaultProductCategories(companyId, context.user.id);

  const page = parsePageParam(params.page);
  const query = params.q?.trim() ?? "";
  const categoryId = params.category?.trim() ?? "";
  const archive = parseArchiveFilter(params.archive);
  const stock = parseStockFilter(params.stock);

  const [result, categories] = await Promise.all([
    getProducts({
      companyId,
      page,
      query,
      categoryId,
      archive,
      stock,
      today,
    }),
    getProductCategories(companyId),
  ]);

  const hiddenFields = {
    category: categoryId || undefined,
    archive: archive === "active" ? undefined : archive,
    stock: stock === "all" ? undefined : stock,
  };

  return (
    <>
      <DashboardHeader title="Estoque" description="Produtos, lotes e movimentações" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {params.arquivado === "1" ? (
          <FormFeedback message="Produto arquivado com sucesso." variant="success" />
        ) : null}

        <InventorySubnav current="produtos" />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? "produto" : "produtos"}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ButtonLink href="/dashboard/estoque/categorias" variant="outline" className="min-h-11">
              Categorias
            </ButtonLink>
            <ButtonLink href="/dashboard/estoque/novo" className="min-h-11">
              <Plus className="size-4" aria-hidden="true" />
              Novo produto
            </ButtonLink>
          </div>
        </div>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Produtos</CardTitle>
                <CardDescription>Busque por nome, SKU ou código de barras.</CardDescription>
              </div>
              <div className="w-full lg:max-w-md">
                <SearchForm
                  action="/dashboard/estoque"
                  defaultValue={query}
                  placeholder="Buscar produtos..."
                  hiddenFields={hiddenFields}
                />
              </div>
            </div>
            <form action="/dashboard/estoque" method="get" className="flex flex-col gap-3 sm:flex-row">
              {query ? <input type="hidden" name="q" value={query} /> : null}
              {archive !== "active" ? <input type="hidden" name="archive" value={archive} /> : null}
              {stock !== "all" ? <input type="hidden" name="stock" value={stock} /> : null}
              <Select name="category" defaultValue={categoryId} className="sm:max-w-xs" aria-label="Filtrar categoria">
                <option value="">Todas as categorias</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium"
              >
                Filtrar
              </button>
            </form>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <ProductFiltersNav
                archive={archive}
                stock={stock}
                query={query || undefined}
                categoryId={categoryId || undefined}
              />
              <ClearSearchLink
                href={`/dashboard/estoque${archive === "active" ? "" : `?archive=${archive}`}`}
                visible={Boolean(query || categoryId || stock !== "all")}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.data.length === 0 ? (
              <EmptyState
                title={query ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
                description={
                  query
                    ? "Tente outro termo ou ajuste os filtros."
                    : "Cadastre o primeiro produto para controlar o estoque."
                }
              />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">Produto</th>
                        <th className="px-4 py-3 font-medium">Categoria</th>
                        <th className="px-4 py-3 font-medium">Estoque</th>
                        <th className="px-4 py-3 font-medium">Mínimo</th>
                        <th className="px-4 py-3 font-medium">Custo</th>
                        <th className="px-4 py-3 font-medium">Venda</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((product) => (
                        <tr key={product.id} className="border-t">
                          <td className="px-4 py-3">
                            <Link
                              href={`/dashboard/estoque/${product.id}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {product.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3">{product.categoryName ?? "—"}</td>
                          <td className="px-4 py-3 font-medium">
                            {formatQuantity(
                              product.currentStock,
                              PRODUCT_UNIT_SHORT_LABELS[product.unit],
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {formatQuantity(
                              product.minimumStock,
                              PRODUCT_UNIT_SHORT_LABELS[product.unit],
                            )}
                          </td>
                          <td className="px-4 py-3">{formatCentsToBRL(product.costPriceCents)}</td>
                          <td className="px-4 py-3">
                            {product.salePriceCents != null
                              ? formatCentsToBRL(product.salePriceCents)
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <StockStatusBadge status={product.stockStatus} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 md:hidden">
                  {result.data.map((product) => (
                    <Link
                      key={product.id}
                      href={`/dashboard/estoque/${product.id}`}
                      className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {product.categoryName ?? "Sem categoria"}
                          </p>
                        </div>
                        <StockStatusBadge status={product.stockStatus} />
                      </div>
                      <p className="mt-3 text-2xl font-semibold tracking-tight">
                        {formatQuantity(
                          product.currentStock,
                          PRODUCT_UNIT_SHORT_LABELS[product.unit],
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Mínimo {formatQuantity(product.minimumStock, PRODUCT_UNIT_SHORT_LABELS[product.unit])}
                        {" · "}
                        Custo {formatCentsToBRL(product.costPriceCents)}
                      </p>
                    </Link>
                  ))}
                </div>

                <PaginationNav
                  page={result.page}
                  totalPages={result.totalPages}
                  basePath="/dashboard/estoque"
                  searchParams={{
                    q: query || undefined,
                    category: categoryId || undefined,
                    archive: archive === "active" ? undefined : archive,
                    stock: stock === "all" ? undefined : stock,
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
