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
  tourId?:
    | "nav-inicio"
    | "nav-tutores"
    | "nav-servicos"
    | "nav-funcionarios"
    | "nav-agenda"
    | "nav-atendimentos"
    | "nav-financeiro";
};

export const dashboardNavItems: DashboardNavItem[] = [
  {
    label: "Início",
    href: "/dashboard",
    icon: Home,
    description: "Visão geral do pet shop",
    tourId: "nav-inicio",
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
    tourId: "nav-agenda",
  },
  {
    label: "Tutores",
    href: "/dashboard/tutores",
    icon: Users,
    description: "Clientes e responsáveis",
    tourId: "nav-tutores",
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
    tourId: "nav-servicos",
  },
  {
    label: "Funcionários",
    href: "/dashboard/funcionarios",
    icon: UserCog,
    description: "Equipe e profissionais",
    tourId: "nav-funcionarios",
  },
  {
    label: "Atendimentos",
    href: "/dashboard/atendimentos",
    icon: ClipboardList,
    description: "Ordens de serviço",
    tourId: "nav-atendimentos",
  },
  {
    label: "Financeiro",
    href: "/dashboard/financeiro",
    icon: DollarSign,
    description: "Receitas e despesas",
    tourId: "nav-financeiro",
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
