"use client";

import { useActionState, useState, type ReactNode } from "react";

import { updateNotificationSettingsAction } from "@/features/notifications/actions";
import { sendWhatsAppAdminTestAction } from "@/features/notifications/admin-test-action";
import {
  getFriendlyNotificationError,
  getNotificationDisplayStatus,
  NOTIFICATION_DISPLAY_STATUS_LABELS,
} from "@/features/notifications/display-status";
import {
  buildMessagePreviewExamples,
  formatCheckedAt,
  formatNotificationWhen,
  getHistoryRecipientLine,
  getWhatsAppIntegrationPresentation,
  HISTORY_TYPE_LABELS,
  subtractHoursFromTime,
  summarizeLastMessage,
  type MessagePreviewExample,
  type WhatsAppPublicStatus,
} from "@/features/notifications/messaging-ux";
import type {
  CompanyNotificationSettings,
  NotificationHistoryItem,
} from "@/features/notifications/types";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AutomaticMessagesPanelProps = {
  settings: CompanyNotificationSettings;
  history: NotificationHistoryItem[];
  timeZone: string;
  companyName: string;
  whatsappStatus: WhatsAppPublicStatus;
  showTestMessage: boolean;
};

const settingsInitialState = {
  error: undefined as string | undefined,
  success: undefined as string | undefined,
};

const testInitialState = {
  error: undefined as string | undefined,
  success: undefined as string | undefined,
};

export function AutomaticMessagesPanel({
  settings,
  history,
  timeZone,
  companyName,
  whatsappStatus,
  showTestMessage,
}: AutomaticMessagesPanelProps) {
  const presentation = getWhatsAppIntegrationPresentation(whatsappStatus);
  const lastMessage = summarizeLastMessage(history, timeZone);
  const previews = buildMessagePreviewExamples({
    companyName,
    sameDayReminderTime: settings.sameDayReminderTime,
  });
  const twoHoursBeforeExample = subtractHoursFromTime("15:00", 2);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Mensagens automáticas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O PetGestor pode enviar lembretes automáticos pelo WhatsApp para seus clientes e
            funcionários.
          </p>
        </div>
        <IntegrationBadge presentation={presentation} />
      </header>

      <div
        className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground"
        role="note"
      >
        <p className="font-medium">Você não precisa enviar manualmente.</p>
        <p className="mt-1 text-muted-foreground">
          Depois de ativar uma automação, o PetGestor envia as mensagens sozinho nos horários
          configurados.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Como funciona?</CardTitle>
          <CardDescription>
            Você configura quais mensagens deseja enviar. Quando um agendamento for criado, o
            PetGestor agenda automaticamente os lembretes. No horário certo, a mensagem é enviada
            pelo WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            <TimelineStep label="Agendamento" value="15:00" />
            <TimelineStep
              label="Lembrete do dia"
              value={settings.sameDayReminderTime}
              hint="no dia do atendimento"
            />
            <TimelineStep
              label="Lembrete 2 horas antes"
              value={twoHoursBeforeExample}
              hint="se o banho for às 15:00"
            />
            <TimelineStep label="Aviso para o tutor" value="Ao marcar como pronto" />
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status do WhatsApp</CardTitle>
          <CardDescription>Resumo simples, sem dados técnicos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <StatusRow label="Integração" value={presentation.integrationLabel} />
          <StatusRow label="Envio automático" value={presentation.sendLabel} />
          <StatusRow
            label="Última verificação"
            value={formatCheckedAt(whatsappStatus.checkedAt, timeZone)}
          />
          <StatusRow label="Última mensagem" value={lastMessage.label} />
        </CardContent>
      </Card>

      <NotificationSettingsForm
        settings={settings}
        previews={previews}
      />

      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">
          Para receber mensagens, o tutor ou funcionário precisa ter um número de WhatsApp válido
          cadastrado.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/dashboard/tutores" variant="outline" size="lg" className="h-11 justify-center">
            Ver tutores sem telefone
          </ButtonLink>
          <ButtonLink
            href="/dashboard/funcionarios"
            variant="outline"
            size="lg"
            className="h-11 justify-center"
          >
            Ver funcionários sem telefone
          </ButtonLink>
        </div>
      </div>

      {showTestMessage ? <ShopSafeTestCard /> : null}

      <NotificationHistoryList items={history} timeZone={timeZone} />
    </div>
  );
}

function IntegrationBadge({
  presentation,
}: {
  presentation: ReturnType<typeof getWhatsAppIntegrationPresentation>;
}) {
  const dotClass =
    presentation.tone === "active"
      ? "bg-emerald-500"
      : presentation.tone === "pending"
        ? "bg-amber-400"
        : "bg-red-500";

  const wrapClass =
    presentation.tone === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : presentation.tone === "pending"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-red-200 bg-red-50 text-red-950";

  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border px-3 py-3", wrapClass)}>
      <span className={cn("size-2.5 rounded-full", dotClass)} aria-hidden="true" />
      <div>
        <p className="font-medium">{presentation.title}</p>
        <p className="text-sm opacity-80">{presentation.badge}</p>
      </div>
    </div>
  );
}

function TimelineStep({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      <div>
        <p className="font-medium">{value}</p>
        <p className="text-sm text-muted-foreground">
          {label}
          {hint ? ` · ${hint}` : null}
        </p>
      </div>
    </li>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function NotificationSettingsForm({
  settings,
  previews,
}: {
  settings: CompanyNotificationSettings;
  previews: ReturnType<typeof buildMessagePreviewExamples>;
}) {
  const [state, formAction, isPending] = useActionState(
    updateNotificationSettingsAction,
    settingsInitialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-semibold">Mensagens para o tutor</h3>
        <AutomationCard
          name="customerSameDayReminderEnabled"
          title="Lembrete no dia"
          description="Envia uma mensagem no WhatsApp do tutor no dia do atendimento."
          defaultChecked={settings.customerSameDayReminderEnabled}
          preview={previews.customer_same_day_reminder}
        >
          <div className="space-y-2">
            <Label htmlFor="sameDayReminderTime">Horário do envio</Label>
            <Input
              id="sameDayReminderTime"
              name="sameDayReminderTime"
              type="time"
              defaultValue={settings.sameDayReminderTime}
              className="h-12 max-w-[11rem] text-base"
            />
            <p className="text-sm text-muted-foreground">
              Horário do envio: {settings.sameDayReminderTime}. Usado no fuso do pet shop.
            </p>
          </div>
        </AutomationCard>
        <AutomationCard
          name="reminder2hEnabled"
          title="Lembrete 2 horas antes"
          description="Envia automaticamente uma mensagem 2 horas antes do atendimento."
          defaultChecked={settings.reminder2hEnabled}
          preview={previews.appointment_reminder_2h}
        />
        <AutomationCard
          name="petReadyEnabled"
          title="Pet pronto"
          description="Quando você marcar o atendimento como Pronto, o tutor recebe automaticamente uma mensagem."
          defaultChecked={settings.petReadyEnabled}
          preview={previews.pet_ready}
        />
        <AutomationCard
          name="appointmentConfirmationEnabled"
          title="Confirmação ao agendar"
          description="Envia uma mensagem quando um novo agendamento é criado."
          defaultChecked={settings.appointmentConfirmationEnabled}
          preview={previews.appointment_confirmation}
        />
        <AutomationCard
          name="reminder24hEnabled"
          title="Lembrete 24 horas antes"
          description="Envia um aviso no dia anterior ao atendimento."
          defaultChecked={settings.reminder24hEnabled}
          preview={previews.appointment_reminder_24h}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Mensagens para o funcionário</h3>
        <AutomationCard
          name="employeeSameDayReminderEnabled"
          title="Lembrete no dia"
          description="Envia uma mensagem para o WhatsApp do funcionário responsável pelo atendimento. Usa o mesmo horário do lembrete do dia dos tutores."
          defaultChecked={settings.employeeSameDayReminderEnabled}
          preview={previews.employee_same_day_reminder}
        />
        <AutomationCard
          name="employeeReminder2hEnabled"
          title="Lembrete 2 horas antes"
          description="Avisa o funcionário automaticamente 2 horas antes do atendimento."
          defaultChecked={settings.employeeReminder2hEnabled}
          preview={previews.employee_2h_reminder}
        />
      </section>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.success}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="h-12 w-full sm:w-auto">
        {isPending ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}

function AutomationCard({
  name,
  title,
  description,
  defaultChecked,
  preview,
  children,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
  preview: MessagePreviewExample;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <AutomationToggle name={name} defaultChecked={defaultChecked} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <MessagePreview preview={preview} />
      </CardContent>
    </Card>
  );
}

function AutomationToggle({
  name,
  defaultChecked,
}: {
  name: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex shrink-0 cursor-pointer flex-col items-end gap-1">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        value="on"
        className="peer sr-only"
      />
      <span className="relative h-7 w-12 rounded-full bg-muted transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
      <span className="text-xs font-medium text-muted-foreground peer-checked:hidden">
        Desativado
      </span>
      <span className="hidden text-xs font-medium text-emerald-700 peer-checked:inline">
        Ativado
      </span>
    </label>
  );
}

function MessagePreview({ preview }: { preview: MessagePreviewExample }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full sm:w-auto"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? "Ocultar exemplo" : "Ver exemplo"}
      </Button>
      {open ? (
        <div className="mt-3 rounded-2xl bg-[#e5ddd5] p-3">
          <div className="max-w-[18rem] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold text-emerald-700">{preview.sender}</p>
            <p className="mt-2 text-sm leading-relaxed">{preview.body}</p>
            <p className="mt-2 text-right text-[11px] text-muted-foreground">{preview.whenLabel}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ShopSafeTestCard() {
  const [state, formAction, isPending] = useActionState(
    sendWhatsAppAdminTestAction,
    testInitialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensagem de teste</CardTitle>
        <CardDescription>
          Essa mensagem será enviada somente para o número de teste configurado. Não é uma
          ferramenta de disparo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          <Button type="submit" disabled={isPending} className="h-11 w-full sm:w-auto">
            {isPending ? "Enviando…" : "Enviar mensagem de teste"}
          </Button>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-emerald-700" role="status">
              {state.success}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

type NotificationHistoryListProps = {
  items: NotificationHistoryItem[];
  timeZone: string;
};

export function NotificationHistoryList({ items, timeZone }: NotificationHistoryListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de mensagens</CardTitle>
        <CardDescription>
          Acompanhe o que já foi agendado e enviado. “Lida” só aparece se o WhatsApp confirmar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma mensagem ainda. Crie um agendamento com as automações ligadas para ver os
            lembretes aqui.
          </p>
        ) : (
          <ul className="grid gap-3">
            {items.map((item) => {
              const displayStatus = getNotificationDisplayStatus({
                status: item.status,
                deliveredAt: item.deliveredAt,
                readAt: item.readAt,
              });
              const friendlyError =
                displayStatus === "failed" ||
                displayStatus === "cancelled" ||
                displayStatus === "simulated" ||
                displayStatus === "pending"
                  ? getFriendlyNotificationError(item.lastError, item.recipientType)
                  : null;

              return (
                <li key={item.id} className="space-y-1 rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{item.recipientName}</p>
                      <p className="text-sm text-muted-foreground">
                        {getHistoryRecipientLine(item.recipientType, item.petName)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        displayStatus === "failed"
                          ? "bg-red-50 text-red-800"
                          : displayStatus === "read" || displayStatus === "delivered"
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-muted text-foreground",
                      )}
                    >
                      {NOTIFICATION_DISPLAY_STATUS_LABELS[displayStatus]}
                    </span>
                  </div>
                  <p className="text-sm">{HISTORY_TYPE_LABELS[item.type]}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatNotificationWhen(item.scheduledFor, timeZone)}
                  </p>
                  {friendlyError ? (
                    <p className="text-sm text-destructive">{friendlyError}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
