import { publicPaths } from "@/config/public-routes";
import {
  formatTrialCtaLabel,
  formatTrialNote,
  PLAN_ANNUAL_MONTHLY_EQUIVALENT_LABEL,
  PLAN_ANNUAL_PRICE_LABEL,
  PLAN_ANNUAL_SAVINGS_LABEL,
  PLAN_MONTHLY_PRICE_LABEL,
  PLAN_OPERATIONAL_ACCESS_LABEL,
  TRIAL_DURATION_DAYS,
} from "@/config/subscription";

export const marketingContent = {
  heroBadge: "Gestão simples para pet shops",
  heroTitle: "Organize seu pet shop com clareza e confiança",
  heroSubtitle:
    "Centralize agenda, tutores, pets, atendimentos, financeiro e estoque em uma plataforma pensada para o dia a dia do seu negócio — sem planilhas, sem confusão.",
  trialCtaLabel: formatTrialCtaLabel(),
  trialNote: formatTrialNote(),
  trialDurationDays: TRIAL_DURATION_DAYS,
  loginCtaLabel: "Entrar",
  loginHref: publicPaths.login,
  signupShortCtaLabel: "Testar grátis",
  signupHref: publicPaths.signup,
  demoCtaLabel: "Ver demonstração",
  demoHref: publicPaths.demo,
  alreadyHaveAccountCtaLabel: "Já tenho conta",
  pricingCtaLabel: "Começar teste gratuito",
  supportCtaLabel: "Falar no WhatsApp",
  navLinks: [
    { label: "Recursos", href: publicPaths.features },
    { label: "Como funciona", href: publicPaths.howItWorks },
    { label: "Preços", href: publicPaths.pricing },
  ],
  benefitsIntroTitle: "O que você já encontra no PetGestor",
  benefitsIntroSubtitle:
    "Módulos operacionais para organizar o dia a dia e acompanhar o movimento do pet shop.",
  benefits: [
    {
      title: "Agenda organizada",
      description:
        "Visualize horários, serviços e profissionais em um calendário por dia ou semana, com conflitos e status claros.",
    },
    {
      title: "Tutores e pets",
      description:
        "Cadastre clientes e animais com histórico de atendimentos e informações sempre à mão.",
    },
    {
      title: "Atendimentos e pacotes",
      description:
        "Registre ordens de serviço, acompanhe cada etapa e venda pacotes com controle de uso.",
    },
    {
      title: "Equipe operacional",
      description:
        "Cadastre profissionais, horários de trabalho e os serviços que cada um realiza.",
    },
    {
      title: "Financeiro, estoque e PDV",
      description:
        "Contas a receber, produtos em estoque e vendas no balcão no mesmo sistema — sem planilha paralela.",
    },
    {
      title: "Relatórios do negócio",
      description:
        "Acompanhe movimento, atendimentos, estoque e desempenho da equipe para decidir com dados reais.",
    },
  ],
  steps: [
    {
      step: "1",
      title: "Cadastre o pet shop",
      description: "Crie sua conta, configure a empresa e convide a equipe quando estiver pronto.",
    },
    {
      step: "2",
      title: "Organize clientes e agendamentos",
      description: "Cadastre tutores, pets e monte a agenda do dia a dia.",
    },
    {
      step: "3",
      title: "Acompanhe operação e financeiro",
      description:
        "Registre atendimentos, vendas no PDV e tenha visão clara do estoque e das contas.",
    },
  ],
  pricing: {
    intro: `Teste grátis por ${TRIAL_DURATION_DAYS} dias com acesso aos módulos operacionais. Sem cartão durante o teste. Depois escolha o plano mensal ou anual.`,
    monthly: {
      title: "Mensal",
      price: PLAN_MONTHLY_PRICE_LABEL,
      period: "por mês",
      bullets: ["Cobrança mensal", PLAN_OPERATIONAL_ACCESS_LABEL],
    },
    annual: {
      title: "Anual",
      badge: "Melhor oferta",
      price: PLAN_ANNUAL_PRICE_LABEL,
      period: "por ano",
      equivalent: `Equivale a ${PLAN_ANNUAL_MONTHLY_EQUIVALENT_LABEL}/mês`,
      savings: `Economize ${PLAN_ANNUAL_SAVINGS_LABEL}`,
      bullets: [
        `Equivale a ${PLAN_ANNUAL_MONTHLY_EQUIVALENT_LABEL}/mês`,
        `Economize ${PLAN_ANNUAL_SAVINGS_LABEL} em 12 meses vs mensal`,
        "Cobrança anual",
      ],
    },
  },
  /** @deprecated Prefer `pricing` — mantido para compatibilidade de imports. */
  pricingTeaser: {
    title: "Planos PetGestor",
    description: `Teste grátis por ${TRIAL_DURATION_DAYS} dias com acesso aos módulos operacionais. Sem cartão durante o teste.`,
    price: PLAN_MONTHLY_PRICE_LABEL,
    period: "por mês após o teste",
  },
  cta: {
    title: "Pronto para simplificar a gestão do seu pet shop?",
    description: `Comece seu teste gratuito de ${TRIAL_DURATION_DAYS} dias. Sem cartão.`,
  },
} as const;
