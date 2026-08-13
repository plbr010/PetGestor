import {
  Calendar,
  ClipboardList,
  CreditCard,
  DollarSign,
  Home,
  PawPrint,
  Scissors,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
};

export const dashboardNavItems: DashboardNavItem[] = [
  {
    label: "Início",
    href: "/dashboard",
    icon: Home,
    description: "Visão geral do pet shop",
  },
  {
    label: "Assinatura",
    href: "/assinatura",
    icon: CreditCard,
    description: "Plano, cobranças e status",
  },
  {
    label: "Agenda",
    href: "/dashboard/agenda",
    icon: Calendar,
    description: "Horários e compromissos",
  },
  {
    label: "Tutores",
    href: "/dashboard/tutores",
    icon: Users,
    description: "Clientes e responsáveis",
  },
  {
    label: "Pets",
    href: "/dashboard/pets",
    icon: PawPrint,
    description: "Cadastro de animais",
  },
  {
    label: "Serviços",
    href: "/dashboard/servicos",
    icon: Scissors,
    description: "Banho, tosa e outros",
  },
  {
    label: "Funcionários",
    href: "/dashboard/funcionarios",
    icon: UserCog,
    description: "Equipe e profissionais",
  },
  {
    label: "Atendimentos",
    href: "/dashboard/atendimentos",
    icon: ClipboardList,
    description: "Ordens de serviço",
  },
  {
    label: "Financeiro",
    href: "/dashboard/financeiro",
    icon: DollarSign,
    description: "Receitas e despesas",
  },
  {
    label: "Configurações",
    href: "/dashboard/configuracoes",
    icon: Settings,
    description: "Preferências da empresa",
  },
];

export const sectionLabels: Record<string, string> = Object.fromEntries(
  dashboardNavItems
    .filter((item) => item.href !== "/dashboard")
    .map((item) => [item.href.replace("/dashboard/", ""), item.label]),
);
