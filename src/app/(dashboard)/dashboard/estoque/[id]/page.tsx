import { ArchiveProductButton } from "@/features/inventory/components/archive-product-button";
import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { StockMovementList } from "@/features/inventory/components/stock-movement-list";
import { StockStatusBadge } from "@/features/inventory/components/stock-status-badge";
import { requireProductById } from "@/features/inventory/queries";
import { formatQuantity } from "@/features/inventory/stock-engine";
import { PRODUCT_UNIT_LABELS, PRODUCT_UNIT_SHORT_LABELS } from "@/features/inventory/units";
import { formatDateDisplay } from "@/lib/pet-display";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatCentsToBRL } from "@/lib/money";
import { getTodayInTimezone } from "@/lib/timezone";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    atualizado?: string;
    entrada?: string;
    saida?: string;
    ajuste?: string;
  }>;
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: ProductDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;
  const today = getTodayInTimezone(context.membership.company.timezone);
  const product = await requireProductById(context.membership.company.id, id, today);
  const unit = PRODUCT_UNIT_SHORT_LABELS[product.unit];
  const archived = Boolean(product.archivedAt);

  return (
    <>
      <DashboardHeader title={product.name} description="detalhe do produto" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <InventorySubnav current="produtos" />

        {query.atualizado === "1" ? (
          <FormFeedback message="Produto atualizado com sucesso." variant="success" />
        ) : null}
        {query.entrada === "1" ? (
          <FormFeedback message="Entrada registrada." variant="success" />
        ) : null}
        {query.saida === "1" ? (
          <FormFeedback message="Saída registrada." variant="success" />
        ) : null}
        {query.ajuste === "1" ? (
          <FormFeedback message="Ajuste registrado." variant="success" />
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StockStatusBadge status={product.stockStatus} />
            <span className="text-sm text-muted-foreground">
              {PRODUCT_UNIT_LABELS[product.unit]}
            </span>
          </div>
          <p className="text-4xl font-semibold tracking-tight">
            {formatQuantity(product.currentStock, unit)}
          </p>
          {product.availableStock < product.currentStock ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Disponível (sem vencidos): {formatQuantity(product.availableStock, unit)}
            </p>
          ) : null}
        </div>

        {!archived ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ButtonLink href={`/dashboard/estoque/${id}/entrada`} className="min-h-12">
              Registrar entrada
            </ButtonLink>
            <ButtonLink href={`/dashboard/estoque/${id}/saida`} variant="outline" className="min-h-12">
              Registrar saída
            </ButtonLink>
            <ButtonLink href={`/dashboard/estoque/${id}/ajuste`} variant="outline" className="min-h-12">
              Ajustar estoque
            </ButtonLink>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!archived ? (
            <ButtonLink href={`/dashboard/estoque/${id}/editar`} variant="outline">
              Editar
            </ButtonLink>
          ) : (
            <span />
          )}
          {!archived ? <ArchiveProductButton productId={id} /> : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Categoria" value={product.categoryName ?? "—"} />
              <Row label="SKU" value={product.sku ?? "—"} />
              <Row label="Código de barras" value={product.barcode ?? "—"} />
              <Row label="Estoque mínimo" value={formatQuantity(product.minimumStock, unit)} />
              <Row label="Custo médio" value={formatCentsToBRL(product.costPriceCents)} />
              <Row
                label="Preço de venda"
                value={
                  product.salePriceCents != null
                    ? formatCentsToBRL(product.salePriceCents)
                    : "—"
                }
              />
              <Row
                label="Fornecedor(es)"
                value={
                  product.suppliers.length > 0
                    ? product.suppliers.map((supplier) => supplier.name).join(", ")
                    : "—"
                }
              />
              {product.description ? (
                <p className="pt-2 text-muted-foreground">{product.description}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lotes e validade</CardTitle>
              <CardDescription>Lotes com quantidade restante.</CardDescription>
            </CardHeader>
            <CardContent>
              {product.batches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum lote informado. Entradas sem lote ficam no saldo geral.
                </p>
              ) : (
                <ul className="space-y-3">
                  {product.batches.map((batch) => (
                    <li key={batch.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{batch.batchCode ?? "Sem código"}</p>
                          <p className="text-muted-foreground">
                            Validade: {formatDateDisplay(batch.expirationDate)}
                          </p>
                        </div>
                        <p className="font-semibold">
                          {formatQuantity(batch.quantityRemaining, unit)}
                        </p>
                      </div>
                      {batch.expired ? (
                        <p className="mt-2 text-destructive">Vencido — não disponível para uso</p>
                      ) : null}
                      {batch.expiringSoon ? (
                        <p className="mt-2 text-amber-700 dark:text-amber-300">Vence em até 30 dias</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de movimentações</CardTitle>
            <CardDescription>Da mais recente para a mais antiga.</CardDescription>
          </CardHeader>
          <CardContent>
            <StockMovementList
              movements={product.movements}
              timeZone={context.membership.company.timezone}
              unit={product.unit}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
