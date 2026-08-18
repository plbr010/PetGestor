"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type {
  PetHistoryEvent,
  PetHistoryFilter,
} from "@/features/pets/history/types";
import { PET_HISTORY_FILTERS } from "@/features/pets/history/types";
import { filterPetHistoryEvents } from "@/features/pets/history/build-history";
import { formatAmountCents } from "@/features/finance/utils";
import { formatDateTimeDisplay } from "@/lib/pet-display";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FILTER_LABELS: Record<PetHistoryFilter, string> = {
  all: "Todos",
  appointments: "Agendamentos",
  services: "Atendimentos",
  financial: "Financeiro",
  cancellations: "Cancelamentos/Faltas",
};

type PetHistoryTimelineProps = {
  petId: string;
  events: PetHistoryEvent[];
  page: number;
  hasMore: boolean;
  initialFilter?: PetHistoryFilter;
};

export function PetHistoryTimeline({
  petId,
  events,
  page,
  hasMore,
  initialFilter = "all",
}: PetHistoryTimelineProps) {
  const [filter, setFilter] = useState<PetHistoryFilter>(initialFilter);

  const filteredEvents = useMemo(
    () => filterPetHistoryEvents(events, filter),
    [events, filter],
  );

  const loadMoreHref = `/dashboard/pets/${petId}?historico=${page + 1}${
    filter !== "all" ? `&filtro=${filter}` : ""
  }`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico</CardTitle>
        <CardDescription>
          Linha do tempo operacional — do mais recente para o mais antigo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PET_HISTORY_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                filter === item
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-muted/40"
              }`}
            >
              {FILTER_LABELS[item]}
            </button>
          ))}
        </div>

        {filteredEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum evento encontrado para este filtro.
          </p>
        ) : (
          <ol className="relative space-y-4 border-l pl-4">
            {filteredEvents.map((event) => (
              <li key={event.id} className="relative pb-2">
                <span className="absolute -left-[9px] top-1 size-4 rounded-full border-2 border-primary bg-background" />
                <div className="space-y-1 rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {event.href ? (
                        <Link
                          href={event.href}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {event.title}
                        </Link>
                      ) : (
                        <p className="font-medium">{event.title}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDateTimeDisplay(event.occurredAt)}
                      </p>
                    </div>
                    {event.statusLabel ? (
                      <Badge variant="secondary">{event.statusLabel}</Badge>
                    ) : null}
                  </div>

                  {event.description ? (
                    <p className="text-sm text-muted-foreground">{event.description}</p>
                  ) : null}

                  <dl className="grid gap-1 text-sm sm:grid-cols-2">
                    {event.serviceName ? (
                      <div>
                        <dt className="text-muted-foreground">Serviço</dt>
                        <dd>{event.serviceName}</dd>
                      </div>
                    ) : null}
                    {event.attachmentCount && event.attachmentCount > 0 ? (
                      <div>
                        <dt className="text-muted-foreground">Anexos</dt>
                        <dd>
                          {event.attachmentCount}{" "}
                          {event.attachmentCount === 1 ? "foto/arquivo" : "fotos/arquivos"}
                        </dd>
                      </div>
                    ) : null}
                    {event.employeeName ? (
                      <div>
                        <dt className="text-muted-foreground">Profissional</dt>
                        <dd>{event.employeeName}</dd>
                      </div>
                    ) : null}
                    {event.priceCents != null ? (
                      <div>
                        <dt className="text-muted-foreground">Valor</dt>
                        <dd>{formatAmountCents(event.priceCents)}</dd>
                      </div>
                    ) : null}
                    {event.paymentMethod ? (
                      <div>
                        <dt className="text-muted-foreground">Pagamento</dt>
                        <dd>{event.paymentMethod}</dd>
                      </div>
                    ) : null}
                    {event.packageName ? (
                      <div>
                        <dt className="text-muted-foreground">Pacote</dt>
                        <dd>{event.packageName}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {event.notes ? (
                    <p className="rounded-md bg-muted/30 p-2 text-sm whitespace-pre-wrap">
                      {event.notes}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}

        {hasMore ? (
          <ButtonLink href={loadMoreHref} variant="outline" className="w-full sm:w-auto">
            Carregar mais
          </ButtonLink>
        ) : null}
      </CardContent>
    </Card>
  );
}
