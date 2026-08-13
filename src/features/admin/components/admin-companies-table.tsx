import Link from "next/link";

import { AdminStatusBadge } from "@/features/admin/components/admin-status-badge";
import type { AdminCompanyListItem } from "@/features/admin/types";
import {
  formatAdminCurrencyFromCents,
  formatAdminDateTime,
} from "@/features/admin/utils";

type AdminCompaniesTableProps = {
  items: AdminCompanyListItem[];
};

export function AdminCompaniesTable({ items }: AdminCompaniesTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhuma conta encontrada com os filtros atuais.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Pet shop</th>
            <th className="px-4 py-3 font-medium">Responsável</th>
            <th className="px-4 py-3 font-medium">E-mail</th>
            <th className="px-4 py-3 font-medium">Criação</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Trial</th>
            <th className="px-4 py-3 font-medium">Tempo trial</th>
            <th className="px-4 py-3 font-medium">Ativação</th>
            <th className="px-4 py-3 font-medium">Próx. cobrança</th>
            <th className="px-4 py-3 font-medium">Últ. pagamento</th>
            <th className="px-4 py-3 font-medium">Status pag.</th>
            <th className="px-4 py-3 font-medium">Acesso</th>
            <th className="px-4 py-3 font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.companyId} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/${item.companyId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {item.companyName}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {item.ownerName ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {item.ownerEmail ?? "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatAdminDateTime(item.createdAt)}
              </td>
              <td className="px-4 py-3">
                <AdminStatusBadge status={item.accountStatus} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                <div>{formatAdminDateTime(item.trialStartedAt)}</div>
                <div className="text-xs">até {formatAdminDateTime(item.trialEndsAt)}</div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {item.trialRemainingLabel}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatAdminDateTime(item.subscribedAt)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatAdminDateTime(item.nextPaymentAt)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatAdminDateTime(item.lastPaymentAt)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {item.lastPaymentStatus ?? "—"}
              </td>
              <td className="px-4 py-3">
                {item.hasOperationalAccess ? (
                  <span className="text-emerald-700">Liberado</span>
                ) : (
                  <span className="text-red-700">Bloqueado</span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatAdminCurrencyFromCents(item.monthlyPriceCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
