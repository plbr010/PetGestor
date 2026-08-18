import Link from "next/link";

import { PosSubnav } from "@/features/pos/components/pos-subnav";
import { getSales } from "@/features/pos/queries";
import { getSaleStatusLabel, formatSaleNumber } from "@/features/pos/utils";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { parseSalePeriodFilter, parseSaleStatusFilter } from "@/features/pos/status";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { parsePageParam } from "@/lib/pagination";
import { formatCentsToBRL } from "@/lib/money";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  ClearSearchLink,
  PaginationNav,
  SearchForm,
} from "@/components/shared/pagination-nav";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ButtonLink } from "@/components/ui/button-link";

type SalesPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    period?: string;
    from?: string;
    to?: string;
    customer?: string;
    payment?: string;
  }>;
};

export default async function SalesHistoryPage({ searchParams }: SalesPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const companyId = context.membership.company.id;
  const timeZone = context.membership.company.timezone;
  const page = parsePageParam(params.page);
  const query = params.q?.trim() ?? "";

  const result = await getSales({
    companyId,
    timeZone,
    page,
    query,
    status: params.status,
    period: params.period,
    from: params.from,
    to: params.to,
    customerId: params.customer,
    paymentMethod: params.payment,
  });

  const hiddenFields = {
    status: params.status,
    period: params.period,
    from: params.from,
    to: params.to,
    customer: params.customer,
    payment: params.payment,
  };

  return (
    <>
      <DashboardHeader title="Vendas" description="Histórico de vendas do PDV" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        <PosSubnav current="vendas" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? "venda" : "vendas"}
          </p>
          <ButtonLink href="/dashboard/pdv" className="min-h-11">
            Nova venda
          </ButtonLink>
        </div>

        <SearchForm
          action="/dashboard/pdv/vendas"
          defaultValue={query}
          placeholder="Buscar por número ou vendedor"
          hiddenFields={hiddenFields}
        />

        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {query ? <input type="hidden" name="q" value={query} /> : null}
          <Select name="period" defaultValue={parseSalePeriodFilter(params.period)} className="min-h-11">
            <option value="all">Todo período</option>
            <option value="today">Hoje</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mês</option>
          </Select>
          <Select name="status" defaultValue={parseSaleStatusFilter(params.status)} className="min-h-11">
            <option value="all">Todos status</option>
            <option value="completed">Concluída</option>
            <option value="partially_paid">Parcialmente paga</option>
            <option value="cancelled">Cancelada</option>
          </Select>
          <Select name="payment" defaultValue={params.payment ?? "all"} className="min-h-11">
            <option value="all">Todas formas</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium"
          >
            Filtrar
          </button>
        </form>

        {query ? (
          <ClearSearchLink href="/dashboard/pdv/vendas" visible={Boolean(query)} />
        ) : null}

        {result.data.length === 0 ? (
          <EmptyState
            title="Nenhuma venda encontrada"
            description="As vendas concluídas no PDV aparecerão aqui."
          />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Venda</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Pago</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Vendedor</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((sale) => (
                    <tr key={sale.id} className="border-t">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/pdv/vendas/${sale.id}`} className="font-medium text-primary">
                          {formatSaleNumber(sale.saleNumber)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(sale.soldAt))}
                      </td>
                      <td className="px-4 py-3">{sale.customerName ?? "—"}</td>
                      <td className="px-4 py-3">{formatCentsToBRL(sale.totalCents)}</td>
                      <td className="px-4 py-3">{formatCentsToBRL(sale.paidCents)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{getSaleStatusLabel(sale.status)}</Badge>
                      </td>
                      <td className="px-4 py-3">{sale.createdByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {result.data.map((sale) => (
                <Link
                  key={sale.id}
                  href={`/dashboard/pdv/vendas/${sale.id}`}
                  className="rounded-xl border p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{formatSaleNumber(sale.saleNumber)}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(sale.soldAt))}
                      </p>
                    </div>
                    <Badge variant="outline">{getSaleStatusLabel(sale.status)}</Badge>
                  </div>
                  <div className="mt-3 flex justify-between text-sm">
                    <span>{sale.customerName ?? "Consumidor não identificado"}</span>
                    <span className="font-semibold">{formatCentsToBRL(sale.totalCents)}</span>
                  </div>
                </Link>
              ))}
            </div>

            <PaginationNav
              basePath="/dashboard/pdv/vendas"
              page={result.page}
              totalPages={result.totalPages}
              searchParams={{ ...hiddenFields, q: query || undefined }}
            />
          </>
        )}
      </main>
    </>
  );
}
