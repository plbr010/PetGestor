import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { demoRecentClients } from "@/config/demo-data";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function RecentClientsList() {
  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Clientes recentes</CardTitle>
        <CardDescription>Tutores e pets cadastrados (demonstração)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {demoRecentClients.map((client) => (
          <div
            key={client.id}
            className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3"
          >
            <Avatar className="size-10">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {getInitials(client.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{client.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                Pet: {client.pet}
              </p>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">{client.lastVisit}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
