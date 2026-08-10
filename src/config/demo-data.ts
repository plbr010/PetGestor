export const demoPetShop = {
  name: "Pet Shop Amigo Fiel",
  ownerName: "Mariana",
  greeting: "Bom dia",
} as const;

export const demoDashboardStats = [
  {
    id: "appointments-today",
    label: "Agendamentos hoje",
    value: "8",
    change: "+2 vs. ontem",
    trend: "up" as const,
  },
  {
    id: "completed-services",
    label: "Atendimentos concluídos",
    value: "5",
    change: "3 em andamento",
    trend: "neutral" as const,
  },
  {
    id: "new-clients",
    label: "Novos clientes",
    value: "12",
    change: "Neste mês",
    trend: "up" as const,
  },
  {
    id: "revenue",
    label: "Faturamento demonstrativo",
    value: "R$ 4.280",
    change: "Período simulado",
    trend: "neutral" as const,
  },
] as const;

export const demoTodaySchedule = [
  {
    id: "sched-1",
    time: "08:30",
    pet: "Thor",
    breed: "Golden Retriever",
    service: "Banho e tosa",
    tutor: "Ana Silva",
    status: "confirmado" as const,
  },
  {
    id: "sched-2",
    time: "10:00",
    pet: "Luna",
    breed: "SRD",
    service: "Consulta veterinária",
    tutor: "Carlos Mendes",
    status: "em-andamento" as const,
  },
  {
    id: "sched-3",
    time: "11:30",
    pet: "Mel",
    breed: "Poodle",
    service: "Hidratação",
    tutor: "Juliana Costa",
    status: "confirmado" as const,
  },
  {
    id: "sched-4",
    time: "14:00",
    pet: "Bob",
    breed: "Bulldog",
    service: "Tosa higiênica",
    tutor: "Roberto Lima",
    status: "pendente" as const,
  },
] as const;

export const demoUpcomingAppointments = [
  {
    id: "apt-1",
    time: "09:00",
    pet: "Thor (Golden)",
    service: "Banho e tosa",
    tutor: "Ana Silva",
    status: "confirmado" as const,
  },
  {
    id: "apt-2",
    time: "10:30",
    pet: "Luna (SRD)",
    service: "Consulta veterinária",
    tutor: "Carlos Mendes",
    status: "em-andamento" as const,
  },
  {
    id: "apt-3",
    time: "14:00",
    pet: "Mel (Poodle)",
    service: "Hidratação",
    tutor: "Juliana Costa",
    status: "confirmado" as const,
  },
] as const;

export const demoRecentClients = [
  {
    id: "client-1",
    name: "Ana Silva",
    pet: "Thor",
    lastVisit: "Hoje, 08:30",
  },
  {
    id: "client-2",
    name: "Carlos Mendes",
    pet: "Luna",
    lastVisit: "Hoje, 10:00",
  },
  {
    id: "client-3",
    name: "Juliana Costa",
    pet: "Mel",
    lastVisit: "Ontem",
  },
] as const;

export const demoFinanceSummary = {
  revenue: "R$ 4.280,00",
  expenses: "R$ 1.950,00",
  balance: "R$ 2.330,00",
  pending: "R$ 680,00",
} as const;

export type AppointmentStatus = (typeof demoTodaySchedule)[number]["status"];

export const statusLabels: Record<AppointmentStatus, string> = {
  confirmado: "Confirmado",
  "em-andamento": "Em andamento",
  pendente: "Pendente",
};
