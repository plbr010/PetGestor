import {
  formatTrialCtaLabel,
  formatTrialNote,
  TRIAL_DURATION_DAYS,
} from "@/config/subscription";

export const marketingContent = {
  heroBadge: "Gestão simples para pet shops",
  heroTitle: "Organize seu pet shop com clareza e confiança",
  heroSubtitle:
    "Centralize agenda, tutores, pets e atendimentos em uma plataforma pensada para o dia a dia do seu negócio — sem planilhas, sem confusão.",
  trialCtaLabel: formatTrialCtaLabel(),
  trialNote: formatTrialNote(),
  trialDurationDays: TRIAL_DURATION_DAYS,
  navLinks: [
    { label: "Recursos", href: "#recursos" },
    { label: "Como funciona", href: "#como-funciona" },
    { label: "Preços", href: "#precos" },
  ],
  benefits: [
    {
      title: "Agenda organizada",
      description:
        "Visualize horários, serviços e profissionais em um calendário claro e fácil de usar.",
    },
    {
      title: "Tutores e pets",
      description:
        "Cadastre clientes e animais com histórico, preferências e informações sempre à mão.",
    },
    {
      title: "Atendimentos acompanhados",
      description:
        "Registre ordens de serviço e acompanhe cada etapa do atendimento com transparência.",
    },
    {
      title: "Visão do negócio",
      description:
        "Tenha indicadores básicos para entender o movimento do pet shop e tomar decisões.",
    },
  ],
  steps: [
    {
      step: "1",
      title: "Cadastre o pet shop",
      description: "Configure sua empresa e convide sua equipe quando estiver pronto.",
    },
    {
      step: "2",
      title: "Organize clientes e agendamentos",
      description: "Cadastre tutores, pets e monte a agenda do dia a dia.",
    },
    {
      step: "3",
      title: "Acompanhe os atendimentos",
      description: "Registre serviços, status e tenha visão clara das operações.",
    },
  ],
  pricingTeaser: {
    title: "Plano PetGestor Mensal",
    description: `Teste grátis por ${TRIAL_DURATION_DAYS} dias (72 horas) com acesso completo. Sem cartão durante o teste.`,
    price: "R$ 89,90",
    period: "por mês após o teste",
  },
  cta: {
    title: "Pronto para simplificar a gestão do seu pet shop?",
    description: `Comece seu teste gratuito de ${TRIAL_DURATION_DAYS} dias. Sem cartão.`,
  },
} as const;
