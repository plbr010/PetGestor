"use client";

import { useActionState } from "react";

import { updateNotificationSettingsAction } from "@/features/notifications/actions";
import {
  NOTIFICATION_RECIPIENT_LABELS,
  NOTIFICATION_STATUS_LABELS,
  NOTIFICATION_TYPE_LABELS,
} from "@/features/notifications/templates";
import type {
  CompanyNotificationSettings,
  NotificationHistoryItem,
} from "@/features/notifications/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type NotificationSettingsFormProps = {
  settings: CompanyNotificationSettings;
};

const initialState = {
  error: undefined as string | undefined,
  success: undefined as string | undefined,
};

export function NotificationSettingsForm({ settings }: NotificationSettingsFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateNotificationSettingsAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensagens automáticas</CardTitle>
        <CardDescription>
          Lembretes internos para tutores e equipe. O envio pelo WhatsApp será conectado depois.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Mensagens para clientes</h3>
            <ToggleField
              name="appointmentConfirmationEnabled"
              label="Confirmar novo agendamento"
              description="Gera uma mensagem de confirmação ao criar o agendamento."
              defaultChecked={settings.appointmentConfirmationEnabled}
            />
            <ToggleField
              name="customerSameDayReminderEnabled"
              label="Lembrete no dia"
              description="Programa um lembrete no horário configurado, no dia do atendimento."
              defaultChecked={settings.customerSameDayReminderEnabled}
            />
            <ToggleField
              name="reminder24hEnabled"
              label="Lembrar 24h antes"
              description="Programa um lembrete um dia antes do horário marcado."
              defaultChecked={settings.reminder24hEnabled}
            />
            <ToggleField
              name="reminder2hEnabled"
              label="Lembrete 2 horas antes"
              description="Programa um lembrete duas horas antes do atendimento."
              defaultChecked={settings.reminder2hEnabled}
            />
            <ToggleField
              name="petReadyEnabled"
              label="Avisar quando o pet estiver pronto"
              description="Gera aviso ao marcar o atendimento como pronto para busca."
              defaultChecked={settings.petReadyEnabled}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Mensagens para equipe</h3>
            <ToggleField
              name="employeeSameDayReminderEnabled"
              label="Lembrete no dia"
              description="Avisa o funcionário no horário configurado, no dia do atendimento."
              defaultChecked={settings.employeeSameDayReminderEnabled}
            />
            <ToggleField
              name="employeeReminder2hEnabled"
              label="Lembrete 2 horas antes"
              description="Avisa o funcionário duas horas antes do atendimento."
              defaultChecked={settings.employeeReminder2hEnabled}
            />
          </section>

          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="sameDayReminderTime">Horário do lembrete do dia</Label>
            <Input
              id="sameDayReminderTime"
              name="sameDayReminderTime"
              type="time"
              defaultValue={settings.sameDayReminderTime}
              className="h-11 max-w-[10rem]"
            />
            <p className="text-sm text-muted-foreground">
              Usado no fuso da empresa. Padrão: 08:00.
            </p>
          </div>

          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-primary" role="status">
              {state.success}
            </p>
          ) : null}

          <Button type="submit" disabled={isPending} className="h-11 w-full sm:w-auto">
            {isPending ? "Salvando…" : "Salvar mensagens automáticas"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ToggleField({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex min-h-14 items-start gap-3 rounded-lg border p-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        value="on"
        className="mt-1 size-5 rounded border"
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
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
          Fila interna — ainda sem envio externo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem gerada ainda.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li key={item.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {item.recipientName} — {NOTIFICATION_RECIPIENT_LABELS[item.recipientType]}
                  </span>
                  <span className="text-muted-foreground">
                    {NOTIFICATION_STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {item.petName} — {item.serviceName}
                </p>
                <p className="text-muted-foreground">
                  {NOTIFICATION_TYPE_LABELS[item.type]} ·{" "}
                  {formatScheduledFor(item.scheduledFor, timeZone)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatScheduledFor(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}
