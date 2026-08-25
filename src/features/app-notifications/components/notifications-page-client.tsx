"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  listAppNotificationsPageAction,
  markAllAppNotificationsReadAction,
  markAppNotificationReadAction,
} from "@/features/app-notifications/actions";
import type { ListAppNotificationsFilter } from "@/features/app-notifications/queries";
import type { AppNotificationRecord } from "@/features/app-notifications/types";
import { Button } from "@/components/ui/button";
import { formatDateTimeDisplay } from "@/lib/pet-display";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ id: ListAppNotificationsFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "read", label: "Lidas" },
];

const SEVERITY_LABEL: Record<AppNotificationRecord["severity"], string> = {
  info: "Info",
  success: "Sucesso",
  warning: "Alerta",
  error: "Erro",
};

type NotificationsPageClientProps = {
  initialItems: AppNotificationRecord[];
  initialFilter: ListAppNotificationsFilter;
};

export function NotificationsPageClient({
  initialItems,
  initialFilter,
}: NotificationsPageClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<ListAppNotificationsFilter>(initialFilter);
  const [items, setItems] = useState(initialItems);
  const [pending, startTransition] = useTransition();

  function changeFilter(next: ListAppNotificationsFilter) {
    setFilter(next);
    startTransition(async () => {
      const list = await listAppNotificationsPageAction(next);
      setItems(list);
    });
  }

  function openItem(item: AppNotificationRecord) {
    startTransition(async () => {
      if (!item.isRead) {
        await markAppNotificationReadAction(item.id);
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? { ...row, isRead: true, readAt: new Date().toISOString() }
              : row,
          ),
        );
      }

      if (item.href) {
        router.push(item.href);
      }
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllAppNotificationsReadAction();
      if (filter === "unread") {
        setItems([]);
      } else {
        setItems((prev) =>
          prev.map((row) => ({
            ...row,
            isRead: true,
            readAt: row.readAt ?? new Date().toISOString(),
          })),
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              size="sm"
              variant={filter === entry.id ? "default" : "outline"}
              disabled={pending}
              onClick={() => changeFilter(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || items.every((item) => item.isRead)}
          onClick={markAll}
        >
          Marcar todas como lidas
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhuma notificação neste filtro.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => openItem(item)}
                className={cn(
                  "flex w-full flex-col gap-1 px-4 py-4 text-left transition-colors hover:bg-muted/60 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
                  !item.isRead && "bg-primary/5",
                )}
              >
                <span className="min-w-0 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{item.title}</span>
                    <span className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {SEVERITY_LABEL[item.severity]}
                    </span>
                    {!item.isRead ? (
                      <span className="text-[11px] font-medium text-primary">Não lida</span>
                    ) : null}
                  </span>
                  <span className="block text-sm text-muted-foreground">{item.message}</span>
                  {item.href ? (
                    <span className="block text-xs text-primary">
                      Abrir{" "}
                      <Link
                        href={item.href}
                        className="underline-offset-4 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        registro
                      </Link>
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTimeDisplay(item.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
