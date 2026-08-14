export type OnboardingTourTargetId =
  | "nav-inicio"
  | "nav-tutores"
  | "nav-servicos"
  | "nav-funcionarios"
  | "nav-agenda"
  | "nav-atendimentos"
  | "nav-financeiro";

export type OnboardingTourStep = {
  id: string;
  title: string;
  description: string;
  targetId: OnboardingTourTargetId | null;
};

/** Etapas do tutorial inicial (mobile-first, sem obrigar cadastros). */
export const ONBOARDING_TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: "welcome",
    title: "Bem-vindo ao PetGestor 👋",
    description:
      "Aqui você acompanha rapidamente o que está acontecendo no seu pet shop: agendamentos, atendimentos e informações importantes do dia.",
    targetId: "nav-inicio",
  },
  {
    id: "customers",
    title: "Cadastre seus clientes e pets",
    description:
      "Comece cadastrando os tutores e seus pets. Essas informações serão usadas nos agendamentos e atendimentos.",
    targetId: "nav-tutores",
  },
  {
    id: "services",
    title: "Configure seus serviços",
    description:
      "Cadastre banho, tosa e outros serviços com preço e duração para agilizar seus agendamentos.",
    targetId: "nav-servicos",
  },
  {
    id: "employees",
    title: "Organize sua equipe",
    description:
      "Cadastre os funcionários, os serviços que realizam e seus horários de trabalho.",
    targetId: "nav-funcionarios",
  },
  {
    id: "agenda",
    title: "Organize seus agendamentos",
    description:
      "Na agenda você controla horários, pets, serviços e responsáveis de forma simples.",
    targetId: "nav-agenda",
  },
  {
    id: "orders",
    title: "Acompanhe cada atendimento",
    description:
      "Veja quais pets estão aguardando, em atendimento, prontos ou concluídos.",
    targetId: "nav-atendimentos",
  },
  {
    id: "finance",
    title: "Tenha controle financeiro",
    description:
      "Acompanhe receitas, despesas e pagamentos para ter uma visão melhor do seu negócio.",
    targetId: "nav-financeiro",
  },
  {
    id: "ready",
    title: "Pronto para começar 🚀",
    description:
      "Agora é só cadastrar seus dados e começar a organizar seu pet shop com o PetGestor.",
    targetId: null,
  },
];

export const ONBOARDING_TOUR_STEP_COUNT = ONBOARDING_TOUR_STEPS.length;

export function shouldAutoStartOnboardingTour(
  completedAt: string | null | undefined,
): boolean {
  return completedAt == null;
}

export function getOnboardingTourStep(index: number): OnboardingTourStep | null {
  if (index < 0 || index >= ONBOARDING_TOUR_STEPS.length) {
    return null;
  }

  return ONBOARDING_TOUR_STEPS[index] ?? null;
}

export function isLastOnboardingTourStep(index: number): boolean {
  return index >= ONBOARDING_TOUR_STEPS.length - 1;
}
