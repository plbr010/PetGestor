import {
  Ban,
  CircleDollarSign,
  Clock3,
  CreditCard,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import type { AdminDashboardSummary } from "@/features/admin/types";
import { formatAdminCurrencyFromCents } from "@/features/admin/utils";

type AdminSummaryCardsProps = {
  summary: AdminDashboardSummary;
};

export function AdminSummaryCards({ summary }: AdminSummaryCardsProps) {
  const cards = [
    {
      id: "total",
      label: "Total de contas",
      value: String(summary.totalAccounts),
      change: "Empresas cadastradas",
      trend: "neutral" as const,
      icon: Users,
    },
    {
      id: "trial",
      label: "Em trial",
      value: String(summary.trialCount),
      change: "Teste de 72h ativo",
      trend: "neutral" as const,
      icon: Clock3,
    },
    {
      id: "active",
      label: "Ativas",
      value: String(summary.activeCount),
      change: "Assinatura em dia",
      trend: "up" as const,
      icon: CreditCard,
    },
    {
      id: "past-due",
      label: "Inadimplentes",
      value: String(summary.pastDueCount),
      change: "Pagamento pendente",
      trend: "down" as const,
      icon: ShieldAlert,
    },
    {
      id: "cancelled",
      label: "Canceladas",
      value: String(summary.cancelledCount),
      change: "Sem renovação",
      trend: "neutral" as const,
      icon: XCircle,
    },
    {
      id: "blocked",
      label: "Bloqueadas",
      value: String(summary.blockedCount),
      change: "Trial expirado / bloqueio",
      trend: "down" as const,
      icon: Ban,
    },
    {
      id: "mrr",
      label: "MRR estimado",
      value: formatAdminCurrencyFromCents(summary.estimatedMrrCents),
      change: "Contas ativas × plano mensal",
      trend: "up" as const,
      icon: CircleDollarSign,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <MetricCard
          key={card.id}
          label={card.label}
          value={card.value}
          change={card.change}
          trend={card.trend}
          icon={card.icon}
        />
      ))}
    </div>
  );
}
