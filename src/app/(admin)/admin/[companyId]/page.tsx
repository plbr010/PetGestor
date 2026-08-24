import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminStatusBadge } from "@/features/admin/components/admin-status-badge";
import { getAdminCompanyDetail } from "@/features/admin/queries";
import {
  formatAdminCurrencyFromCents,
  formatAdminDateTime,
} from "@/features/admin/utils";
import { buildWhatsAppUrl, formatPhoneDisplay } from "@/lib/phone";
import { isValidUuid } from "@/lib/security/uuid";

type AdminCompanyPageProps = {
  params: Promise<{ companyId: string }>;
};

export default async function AdminCompanyDetailPage({
  params,
}: AdminCompanyPageProps) {
  const { companyId } = await params;

  if (!isValidUuid(companyId)) {
    notFound();
  }

  const detail = await getAdminCompanyDetail(companyId);

  if (!detail) {
    notFound();
  }

  const phoneDisplay = detail.ownerPhone
    ? formatPhoneDisplay(detail.ownerPhone)
    : "—";
  const whatsappUrl = detail.ownerPhone
    ? buildWhatsAppUrl(detail.ownerPhone)
    : null;

  const fields = [
    { label: "Pet shop", value: detail.companyName },
    { label: "Responsável", value: detail.ownerName ?? "—" },
    { label: "E-mail", value: detail.ownerEmail ?? "—" },
    { label: "Telefone", value: phoneDisplay },
    { label: "Timezone", value: detail.timezone },
    { label: "Criada em", value: formatAdminDateTime(detail.createdAt) },
    { label: "Plano", value: detail.planCode ?? "—" },
    {
      label: "Intervalo",
      value:
        detail.billingInterval === "annual"
          ? "Anual"
          : detail.billingInterval === "monthly"
            ? "Mensal"
            : "—",
    },
    {
      label: "Valor",
      value: formatAdminCurrencyFromCents(detail.planPriceCents ?? detail.monthlyPriceCents),
    },
    {
      label: "Acesso operacional",
      value: detail.hasOperationalAccess ? "Liberado" : "Bloqueado",
    },
    { label: "Trial início", value: formatAdminDateTime(detail.trialStartedAt) },
    { label: "Trial fim", value: formatAdminDateTime(detail.trialEndsAt) },
    { label: "Tempo do trial", value: detail.trialRemainingLabel },
    { label: "Ativação", value: formatAdminDateTime(detail.subscribedAt) },
    { label: "Checkout iniciado", value: formatAdminDateTime(detail.checkoutStartedAt) },
    { label: "Próxima cobrança", value: formatAdminDateTime(detail.nextPaymentAt) },
    { label: "Último pagamento", value: formatAdminDateTime(detail.lastPaymentAt) },
    { label: "Status do pagamento", value: detail.lastPaymentStatus ?? "—" },
    { label: "Período atual (início)", value: formatAdminDateTime(detail.currentPeriodStart) },
    { label: "Período atual (fim)", value: formatAdminDateTime(detail.currentPeriodEnd) },
    { label: "Cancelada em", value: formatAdminDateTime(detail.cancelledAt) },
    {
      label: "Cancela no fim do período",
      value: detail.cancelAtPeriodEnd ? "Sim" : "Não",
    },
    { label: "Provider", value: detail.provider ?? "—" },
    { label: "Status no provider", value: detail.providerStatus ?? "—" },
    {
      label: "ID externo Mercado Pago",
      value: detail.providerSubscriptionId ?? "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Voltar para lista
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{detail.companyName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Detalhes administrativos da conta
          </p>
        </div>
        <AdminStatusBadge status={detail.accountStatus} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da conta</CardTitle>
          <CardDescription>Informações não sensíveis para acompanhamento interno.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label} className="space-y-1 rounded-lg border bg-muted/20 p-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {field.label}
                </dt>
                <dd className="break-all text-sm font-medium">{field.value}</dd>
              </div>
            ))}
          </dl>
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Abrir WhatsApp do responsável
            </a>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de eventos de billing</CardTitle>
          <CardDescription>
            Eventos de webhook associados ao ID externo da assinatura (quando disponíveis).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.webhookEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento de webhook encontrado para esta assinatura.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-medium">Recebido</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 font-medium">Ação</th>
                    <th className="px-2 py-2 font-medium">Resource</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.webhookEvents.map((event) => (
                    <tr key={event.id} className="border-b last:border-0">
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatAdminDateTime(event.receivedAt)}
                      </td>
                      <td className="px-2 py-2">{event.eventType}</td>
                      <td className="px-2 py-2">{event.action ?? "—"}</td>
                      <td className="px-2 py-2 break-all">{event.resourceId ?? "—"}</td>
                      <td className="px-2 py-2">{event.processingStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
