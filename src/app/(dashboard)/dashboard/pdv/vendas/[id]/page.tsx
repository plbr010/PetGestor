import { notFound } from "next/navigation";

import { CancelSaleForm } from "@/features/pos/components/cancel-sale-form";
import { RegisterSalePaymentForm } from "@/features/pos/components/register-sale-payment-form";
import { SaleReceipt } from "@/features/pos/components/sale-receipt";
import { PosSubnav } from "@/features/pos/components/pos-subnav";
import { canReceiveSalePayment, computeSaleBalanceCents } from "@/features/pos/balance";
import { requireSaleById } from "@/features/pos/queries";
import { canCancelSale } from "@/features/pos/status";
import { getSaleStatusLabel, formatSaleNumber } from "@/features/pos/utils";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { formatQuantity } from "@/features/inventory/stock-engine";
import { hasPermission } from "@/lib/auth/permissions";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { isValidUuid } from "@/lib/security/uuid";
import { formatCentsToBRL } from "@/lib/money";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SaleDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ concluida?: string }>;
};

export default async function SaleDetailPage({ params, searchParams }: SaleDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;

  if (!isValidUuid(id)) {
    notFound();
  }

  const sale = await requireSaleById(context.membership.company.id, id);
  const activePayments = sale.payments.filter((payment) => !payment.cancelledAt);
  const balanceCents = computeSaleBalanceCents(sale.totalCents, sale.paidCents);
  const showRegisterPayment =
    canReceiveSalePayment({
      status: sale.status,
      cancelledAt: sale.cancelledAt,
      totalCents: sale.totalCents,
      paidCents: sale.paidCents,
    }) && hasPermission(context.membership, "pos.receive_payment");
  const showCancel =
    canCancelSale(sale.status, sale.cancelledAt) &&
    hasPermission(context.membership, "pos.cancel_sale");

  const grossMarginCents = sale.items.reduce((sum, item) => {
    const revenue = Math.round(item.quantity * item.unitPriceCents);
    const cost = Math.round(item.quantity * item.costPriceCentsSnapshot);
    return sum + (revenue - cost);
  }, 0);

  return (
    <>
      <DashboardHeader
        title={formatSaleNumber(sale.saleNumber)}
        description="Detalhe da venda"
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <PosSubnav current="vendas" />

        {query.concluida === "1" ? (
          <FormFeedback message="Venda concluída com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/dashboard/pdv/vendas" variant="outline" className="min-h-11">
            Voltar ao histórico
          </ButtonLink>
          <ButtonLink href="/dashboard/pdv" className="min-h-11">
            Nova venda
          </ButtonLink>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
              <CardDescription>
                {sale.customerName ?? "Consumidor não identificado"} ·{" "}
                {getSaleStatusLabel(sale.status)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {sale.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 border-b pb-3 last:border-none">
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatQuantity(item.quantity)} × {formatCentsToBRL(item.unitPriceCents)}
                      </p>
                    </div>
                    <p className="font-medium">{formatCentsToBRL(item.totalCents)}</p>
                  </li>
                ))}
              </ul>

              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{formatCentsToBRL(sale.subtotalCents)}</dd>
                </div>
                {sale.discountCents > 0 ? (
                  <div className="flex justify-between text-destructive">
                    <dt>Desconto</dt>
                    <dd>-{formatCentsToBRL(sale.discountCents)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{formatCentsToBRL(sale.totalCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Pago</dt>
                  <dd>{formatCentsToBRL(sale.paidCents)}</dd>
                </div>
                <div
                  className={
                    balanceCents > 0
                      ? "flex justify-between font-medium text-amber-700"
                      : "flex justify-between text-muted-foreground"
                  }
                >
                  <dt>Saldo pendente</dt>
                  <dd>{formatCentsToBRL(balanceCents)}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Lucro bruto (snapshot)</dt>
                  <dd>{formatCentsToBRL(grossMarginCents)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pagamentos</CardTitle>
                <CardDescription>Cada pagamento permanece identificável</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activePayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
                ) : (
                  activePayments.map((payment) => (
                    <div key={payment.id} className="flex justify-between gap-3 text-sm">
                      <div>
                        <p>{PAYMENT_METHOD_LABELS[payment.paymentMethod]}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(payment.paidAt))}
                        </p>
                      </div>
                      <span className="font-medium">{formatCentsToBRL(payment.amountCents)}</span>
                    </div>
                  ))
                )}
                {sale.changeCents > 0 ? (
                  <div className="flex justify-between border-t pt-3 font-medium">
                    <span>Troco</span>
                    <span>{formatCentsToBRL(sale.changeCents)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t pt-3 text-sm">
                  <span className="text-muted-foreground">Total pago</span>
                  <span className="font-medium">{formatCentsToBRL(sale.paidCents)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo</span>
                  <span className={balanceCents > 0 ? "font-medium text-amber-700" : ""}>
                    {formatCentsToBRL(balanceCents)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Informações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Status: </span>
                  <Badge variant="outline">{getSaleStatusLabel(sale.status)}</Badge>
                </p>
                <p>
                  <span className="text-muted-foreground">Vendedor: </span>
                  {sale.createdByName}
                </p>
                <p>
                  <span className="text-muted-foreground">Data: </span>
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "full",
                    timeStyle: "short",
                  }).format(new Date(sale.soldAt))}
                </p>
                {sale.cancelledAt ? (
                  <p className="text-destructive">
                    Cancelada em{" "}
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(sale.cancelledAt))}
                    {sale.cancelReason ? ` — ${sale.cancelReason}` : ""}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {showRegisterPayment ? (
              <RegisterSalePaymentForm
                key={`${sale.id}-${sale.paidCents}`}
                saleId={sale.id}
                remainingCents={balanceCents}
              />
            ) : null}

            {showCancel ? <CancelSaleForm saleId={sale.id} /> : null}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Comprovante</CardTitle>
          </CardHeader>
          <CardContent>
            <SaleReceipt sale={sale} companyName={context.membership.company.name} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
