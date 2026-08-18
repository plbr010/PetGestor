import { ServiceOrderAttachmentsPanel } from "@/features/attachments/components/service-order-attachments-panel";
import { getServiceOrderAttachments } from "@/features/attachments/queries";
import { ServiceOrderPackagePanel } from "@/features/service-packages/components/service-order-package-panel";
import {
  getPackageCreditsForServiceOrder,
  getPackageUsageForServiceOrder,
} from "@/features/service-packages/queries";
import { ServiceOrderFinancePanel } from "@/features/finance/components/service-order-finance-panel";
import { getFinancialEntryByServiceOrderId } from "@/features/finance/queries";
import { ServiceOrderActions } from "@/features/service-orders/components/service-order-actions";
import { ServiceOrderNotesForm } from "@/features/service-orders/components/service-order-notes-form";
import { ServiceOrderStatusBadge } from "@/features/service-orders/components/service-order-status-badge";
import { requireServiceOrderById } from "@/features/service-orders/queries";
import {
  formatAppointmentTimeRange,
  formatPriceSnapshot,
} from "@/features/appointments/utils";
import {
  formatCheckInLabel,
  formatTimestampLabel,
} from "@/features/service-orders/utils";
import { formatDurationLabel } from "@/features/services/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatUtcDateInTimezone } from "@/lib/timezone";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ServiceOrderDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ atualizado?: string }>;
};

export default async function ServiceOrderDetailPage({
  params,
  searchParams,
}: ServiceOrderDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;
  const timeZone = context.membership.company.timezone;
  const order = await requireServiceOrderById(context.membership.company.id, id);
  const financialEntry = await getFinancialEntryByServiceOrderId(
    context.membership.company.id,
    order.id,
  );
  const [packageCredits, packageUsage, attachments] = await Promise.all([
    getPackageCreditsForServiceOrder(context.membership.company.id, order.id, timeZone),
    getPackageUsageForServiceOrder(context.membership.company.id, order.id),
    getServiceOrderAttachments(context.membership.company.id, order.id),
  ]);
  const localDate = formatUtcDateInTimezone(order.appointment.scheduled_start, timeZone);

  return (
    <>
      <DashboardHeader title="Ordem de serviço" description={order.appointment.pet.name} />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {query.atualizado === "1" ? (
          <FormFeedback message="Atendimento atualizado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <ServiceOrderStatusBadge status={order.status} />
          <ButtonLink href={`/dashboard/agenda/${order.appointment_id}`} variant="outline" size="sm">
            Ver agendamento
          </ButtonLink>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Atendimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Pet" value={order.appointment.pet.name} />
              <Row label="Tutor" value={order.appointment.customer.name} />
              <Row label="Telefone" value={formatPhoneDisplay(order.appointment.customer.phone)} />
              <Row label="Serviço" value={order.appointment.service_name_snapshot} />
              <Row label="Preço" value={formatPriceSnapshot(order.appointment.price_cents_snapshot)} />
              <Row
                label="Duração prevista"
                value={formatDurationLabel(order.appointment.duration_minutes_snapshot)}
              />
              <Row label="Profissional" value={order.appointment.employee.name} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Horários</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Data agendada" value={localDate} />
              <Row
                label="Horário agendado"
                value={formatAppointmentTimeRange(
                  order.appointment.scheduled_start,
                  order.appointment.scheduled_end,
                  timeZone,
                )}
              />
              <Row label="Chegada" value={formatCheckInLabel(order.check_in_at, timeZone)} />
              <Row
                label="Início"
                value={formatTimestampLabel(order.started_at, timeZone, "Início")}
              />
              <Row
                label="Pronto"
                value={formatTimestampLabel(order.ready_at, timeZone, "Pronto")}
              />
              <Row
                label="Finalização"
                value={formatTimestampLabel(order.completed_at, timeZone, "Finalizado")}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceOrderNotesForm order={order} />
          </CardContent>
        </Card>

        <ServiceOrderAttachmentsPanel serviceOrderId={order.id} attachments={attachments} />

        <ServiceOrderPackagePanel
          serviceOrderId={order.id}
          status={order.status}
          credits={packageCredits}
          hasConsumedUsage={Boolean(packageUsage)}
        />

        <ServiceOrderFinancePanel
          entry={financialEntry}
          serviceOrderStatus={order.status}
          timeZone={timeZone}
        />

        <ServiceOrderActions
          serviceOrderId={order.id}
          status={order.status}
          pendingPaymentAmountCents={
            financialEntry?.status === "pending" ? financialEntry.amount_cents : null
          }
        />
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
