"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  getAppNotificationsPanelAction,
  markAllAppNotificationsReadAction,
  markAppNotificationReadAction,
  type AppNotificationsPanelData,
} from "@/features/app-notifications/actions";
import type { AppNotificationRecord } from "@/features/app-notifications/types";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatDateTimeDisplay } from "@/lib/pet-display";
import { cn } from "@/lib/utils";

const SEVERITY_DOT: Record<AppNotificationRecord["severity"], string> = {
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
};

function NotificationListItem({
  item,
  onOpen,
}: {
  item: AppNotificationRecord;
  onOpen: (item: AppNotificationRecord) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/80",
        !item.isRead && "bg-primary/5",
      )}
    >
      <span
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[item.severity])}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium leading-snug text-foreground">{item.title}</span>
          {!item.isRead ? (
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" aria-label="Não lida" />
          ) : null}
        </span>
        <span className="block text-sm leading-snug text-muted-foreground">{item.message}</span>
        <span className="block text-xs text-muted-foreground/80">
          {formatDateTimeDisplay(item.createdAt)}
        </span>
      </span>
    </button>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AppNotificationsPanelData>({
    items: [],
    unreadCount: 0,
  });
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const next = await getAppNotificationsPanelAction();
      setData(next);
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
    }
  }, [open]);

  function handleOpenItem(item: AppNotificationRecord) {
    startTransition(async () => {
      if (!item.isRead) {
        await markAppNotificationReadAction(item.id);
        setData((prev) => ({
          unreadCount: Math.max(0, prev.unreadCount - 1),
          items: prev.items.map((row) =>
            row.id === item.id
              ? { ...row, isRead: true, readAt: new Date().toISOString() }
              : row,
          ),
        }));
      }

      setOpen(false);

      if (item.href) {
        router.push(item.href);
      }
    });
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllAppNotificationsReadAction();
      setData((prev) => ({
        unreadCount: 0,
        items: prev.items.map((row) => ({
          ...row,
          isRead: true,
          readAt: row.readAt ?? new Date().toISOString(),
        })),
      }));
    });
  }

  const badge =
    data.unreadCount > 99 ? "99+" : data.unreadCount > 0 ? String(data.unreadCount) : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={
          badge ? `Notificações, ${badge} não lidas` : "Notificações"
        }
        className={cn(
          "relative inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted",
        )}
      >
        <Bell className="size-4" aria-hidden="true" />
        {badge ? (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-4 text-left">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle>Notificações</SheetTitle>
            {data.unreadCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={handleMarkAll}
              >
                Marcar todas
              </Button>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {data.items.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Nenhuma notificação por enquanto.
            </p>
          ) : (
            <ul className="space-y-1">
              {data.items.map((item) => (
                <li key={item.id}>
                  <NotificationListItem item={item} onOpen={handleOpenItem} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t p-4">
          <ButtonLink
            href="/notificacoes"
            variant="outline"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            Ver todas
          </ButtonLink>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            <Link href="/notificacoes" className="underline-offset-4 hover:underline" onClick={() => setOpen(false)}>
              Abrir central completa
            </Link>
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
