import {
  CloseCashSessionForm,
  OpenCashSessionForm,
} from "@/features/pos/components/cash-session-forms";
import { PosSubnav } from "@/features/pos/components/pos-subnav";
import {
  getOpenCashPreview,
  listRecentCashSessions,
  type CashSessionView,
} from "@/features/pos/cash-queries";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { formatCentsToBRL } from "@/lib/money";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PaymentMethod } from "@/types/database.types";

const METHOD_ORDER: PaymentMethod[] = [
  "cash",
  "pix",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "other",
];

function ClosedSessionSummary({ session }: { session: CashSessionView }) {
  const summary = session.summary;

  return (
    <li className="rounded-xl border p-4 text-sm space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(session.openedAt))}
          {session.closedAt
            ? ` → ${new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(session.closedAt))}`
            : ""}
        </p>
        <p
          className={
            (session.differenceCents ?? 0) === 0
              ? "text-muted-foreground"
              : (session.differenceCents ?? 0) > 0
                ? "text-emerald-700"
                : "text-destructive"
          }
        >
          Diferença: {formatCentsToBRL(session.differenceCents ?? 0)}
        </p>
      </div>
      <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
        <p>Inicial: {formatCentsToBRL(session.openingBalanceCents)}</p>
        <p>Esperado: {formatCentsToBRL(session.expectedCashCents ?? 0)}</p>
        <p>Contado: {formatCentsToBRL(session.countedCashCents ?? 0)}</p>
      </div>
      {summary ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {METHOD_ORDER.map((method) => (
            <span key={method}>
              {PAYMENT_METHOD_LABELS[method]} {formatCentsToBRL(summary[method])}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export default async function PosCashPage() {
  const context = await requirePermission("pos.close_cash");
  const companyId = context.membership.company.id;
  const canUsePos = hasPermission(context.membership, "pos.use");

  const [preview, recent] = await Promise.all([
    getOpenCashPreview(companyId),
    listRecentCashSessions(companyId, 8),
  ]);

  const closedSessions = recent.filter((session) => session.status === "closed");

  return (
    <>
      <DashboardHeader
        title="Caixa do PDV"
        description="Abertura, resumo por forma de pagamento e fechamento"
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {canUsePos ? <PosSubnav current="caixa" /> : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{preview ? "Caixa aberto" : "Abrir caixa"}</CardTitle>
              <CardDescription>
                Somente dinheiro físico altera o saldo do gaveteiro. PIX e cartão aparecem no
                resumo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {preview ? <CloseCashSessionForm preview={preview} /> : <OpenCashSessionForm />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fechamentos recentes</CardTitle>
              <CardDescription>Histórico das últimas sessões encerradas</CardDescription>
            </CardHeader>
            <CardContent>
              {closedSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum fechamento registrado ainda.</p>
              ) : (
                <ul className="space-y-3">
                  {closedSessions.map((session) => (
                    <ClosedSessionSummary key={session.id} session={session} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
