"use client";

import { useActionState } from "react";

import { updateNotificationSettingsAction } from "@/features/notifications/actions";
import {
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
import { formatDateTimeDisplay } from "@/lib/pet-display";

type NotificationSettingsFormProps = {
  settings: CompanyNotificationSettings;
};

const initialState = { error: undefined as string | undefined, success: undefined as string | undefined };

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
          Defina quais avisos serão gerados para os tutores com base nos agendamentos.
          O envio pelo WhatsApp será conectado posteriormente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <ToggleField
            name="appointmentConfirmationEnabled"
            label="Confirmar novo agendamento"
            description="Gera uma mensagem de confirmação ao criar o agendamento."
            defaultChecked={settings.appointmentConfirmationEnabled}
          />
          <ToggleField
            name="reminder24hEnabled"
            label="Lembrar 24h antes"
            description="Programa um lembrete um dia antes do horário marcado."
            defaultChecked={settings.reminder24hEnabled}
          />
          <ToggleField
            name="reminder2hEnabled"
            label="Lembrar 2h antes"
            description="Programa um lembrete duas horas antes do atendimento."
            defaultChecked={settings.reminder2hEnabled}
          />
          <ToggleField
            name="petReadyEnabled"
            label="Avisar quando o pet estiver pronto"
            description="Gera aviso ao marcar o atendimento como pronto para busca."
            defaultChecked={settings.petReadyEnabled}
          />

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

          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
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
    <label className="flex items-start gap-3 rounded-lg border p-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        value="on"
        className="mt-1 size-4 rounded border"
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
};

export function NotificationHistoryList({ items }: NotificationHistoryListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de mensagens</CardTitle>
        <CardDescription>
          Notificações geradas internamente — ainda sem envio externo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma mensagem gerada ainda.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li key={item.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {item.customerName} · {item.petName}
                  </span>
                  <span className="text-muted-foreground">
                    {NOTIFICATION_STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {NOTIFICATION_TYPE_LABELS[item.type]}
                </p>
                <p className="text-muted-foreground">
                  Programada: {formatDateTimeDisplay(item.scheduledFor)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
