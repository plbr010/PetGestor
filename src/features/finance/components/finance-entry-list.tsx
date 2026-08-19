import Link from "next/link";

import { FinancialEntryStatusBadge } from "@/features/finance/components/financial-entry-status-badge";
import type { FinancialEntryListItem } from "@/features/finance/types";
import {
  formatAmountCents,
  formatDisplayDate,
  formatPaidAt,
  getPaymentMethodLabel,
  getSourceLabel,
  getTypeLabel,
} from "@/features/finance/utils";

type FinanceEntryListProps = {
  entries: FinancialEntryListItem[];
  timeZone: string;
};

export function FinanceEntryList({ entries, timeZone }: FinanceEntryListProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Pagamento</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b">
                <td className="px-3 py-3">
                  {formatDisplayDate(
                    entry.due_date ??
                      (entry.created_at ? entry.created_at.slice(0, 10) : null),
                  )}
                </td>
                <td className="px-3 py-3">
                  <div>
                    <p className="font-medium">{entry.description}</p>
                    {entry.service_order ? (
                      <p className="text-xs text-muted-foreground">
                        {entry.service_order.appointment.customer.name} ·{" "}
                        {entry.service_order.appointment.pet.name}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-3">{getTypeLabel(entry.entry_type)}</td>
                <td className="px-3 py-3">{getSourceLabel(entry.source_type)}</td>
                <td
                  className={`px-3 py-3 font-medium ${
                    entry.entry_type === "income" ? "text-success" : "text-destructive"
                  }`}
                >
                  {formatAmountCents(entry.amount_cents)}
                </td>
                <td className="px-3 py-3">
                  <FinancialEntryStatusBadge status={entry.status} />
                </td>
                <td className="px-3 py-3">
                  {entry.status === "paid"
                    ? `${getPaymentMethodLabel(entry.payment_method)} · ${formatPaidAt(entry.paid_at, timeZone)}`
                    : "—"}
                </td>
                <td className="px-3 py-3">
                  <Link href={`/dashboard/financeiro/${entry.id}`} className="text-primary hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link
              href={`/dashboard/financeiro/${entry.id}`}
              className="block rounded-xl border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{entry.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {getTypeLabel(entry.entry_type)} · {getSourceLabel(entry.source_type)}
                  </p>
                </div>
                <FinancialEntryStatusBadge status={entry.status} />
              </div>
              <p
                className={`mt-2 text-lg font-semibold ${
                  entry.entry_type === "income" ? "text-success" : "text-destructive"
                }`}
              >
                {formatAmountCents(entry.amount_cents)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
