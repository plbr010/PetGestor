import Link from "next/link";

import type { RecentCustomerItem } from "@/features/customers/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDateTimeDisplay } from "@/lib/pet-display";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type RecentClientsListProps = {
  customers: RecentCustomerItem[];
};

export function RecentClientsList({ customers }: RecentClientsListProps) {
  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Tutores recentes</CardTitle>
        <CardDescription>Últimos cadastros no pet shop</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum tutor cadastrado ainda.{" "}
            <Link href="/dashboard/tutores/novo" className="font-medium text-primary underline-offset-4 hover:underline">
              Cadastrar tutor
            </Link>
          </p>
        ) : (
          customers.map((client) => (
            <Link
              key={client.id}
              href={`/dashboard/tutores/${client.id}`}
              className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
            >
              <Avatar className="size-10">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {getInitials(client.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{client.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {client.petName ? `Pet: ${client.petName}` : "Sem pet vinculado"}
                </p>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                {formatDateTimeDisplay(client.createdAt)}
              </p>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
