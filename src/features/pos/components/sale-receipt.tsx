"use client";

import { useMemo } from "react";

import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { formatQuantity } from "@/features/inventory/stock-engine";
import { getSaleStatusLabel, formatSaleNumber } from "@/features/pos/utils";
import type { SaleDetail } from "@/features/pos/types";
import { formatCentsToBRL } from "@/lib/money";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";

export function SaleReceipt({
  sale,
  companyName,
}: {
  sale: SaleDetail;
  companyName: string;
}) {
  const activePayments = sale.payments.filter((payment) => !payment.cancelledAt);
  const soldAt = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(sale.soldAt)),
    [sale.soldAt],
  );

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <div
        id="sale-receipt"
        className="mx-auto max-w-md rounded-xl border bg-background p-4 text-sm print:border-none print:p-0"
      >
        <div className="space-y-1 text-center">
          <p className="text-base font-semibold">{companyName || brand.name}</p>
          <p className="text-muted-foreground">{soldAt}</p>
          <p className="font-medium">{formatSaleNumber(sale.saleNumber)}</p>
          <p className="text-muted-foreground">{getSaleStatusLabel(sale.status)}</p>
        </div>

        <div className="my-4 border-t border-dashed" />

        <ul className="space-y-3">
          {sale.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-muted-foreground">
                  {formatQuantity(item.quantity)} × {formatCentsToBRL(item.unitPriceCents)}
                </p>
              </div>
              <p className="font-medium">{formatCentsToBRL(item.totalCents)}</p>
            </li>
          ))}
        </ul>

        <div className="my-4 border-t border-dashed" />

        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatCentsToBRL(sale.subtotalCents)}</dd>
          </div>
          {sale.discountCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Desconto</dt>
              <dd>-{formatCentsToBRL(sale.discountCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatCentsToBRL(sale.totalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Pago</dt>
            <dd>{formatCentsToBRL(sale.paidCents)}</dd>
          </div>
          {sale.paidCents < sale.totalCents && !sale.cancelledAt ? (
            <div className="flex justify-between font-medium">
              <dt>Saldo pendente</dt>
              <dd>{formatCentsToBRL(Math.max(0, sale.totalCents - sale.paidCents))}</dd>
            </div>
          ) : null}
        </dl>

        <div className="my-4 border-t border-dashed" />

        <div className="space-y-1">
          <p className="font-medium">Pagamentos</p>
          {activePayments.map((payment) => (
            <div key={payment.id} className="flex justify-between text-muted-foreground">
              <span>{PAYMENT_METHOD_LABELS[payment.paymentMethod]}</span>
              <span>{formatCentsToBRL(payment.amountCents)}</span>
            </div>
          ))}
          {sale.changeCents > 0 ? (
            <div className="flex justify-between font-medium">
              <span>Troco</span>
              <span>{formatCentsToBRL(sale.changeCents)}</span>
            </div>
          ) : null}
        </div>

        {sale.customerName ? (
          <p className="mt-4 text-muted-foreground">Cliente: {sale.customerName}</p>
        ) : (
          <p className="mt-4 text-muted-foreground">Consumidor não identificado</p>
        )}

        <p className="mt-2 text-xs text-muted-foreground">Vendedor: {sale.createdByName}</p>
      </div>

      <div className="flex flex-col gap-2 print:hidden sm:flex-row">
        <Button type="button" className="min-h-11 flex-1" onClick={handlePrint}>
          Imprimir / Salvar PDF
        </Button>
      </div>
    </div>
  );
}
