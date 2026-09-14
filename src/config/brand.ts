import { TRIAL_DURATION_DAYS } from "@/config/subscription";

export const brand = {
  name: "PetGestor",
  tagline: "Gestão simples para pet shops",
  description:
    "Organize agenda, tutores, pets, atendimentos, financeiro, estoque e PDV em um só lugar. Feito para pet shops que querem crescer com clareza.",
  defaultTitle: "PetGestor — Gestão simples para pet shops",
  defaultDescription: `Sistema de gestão para pet shops: agenda, tutores, pets, atendimentos, financeiro, estoque, PDV e relatórios. Teste grátis por ${TRIAL_DURATION_DAYS} dias, sem cartão.`,
  locale: "pt-BR",
  supportWhatsApp: {
    /** Telefone BR (DDD + número) usado em `buildWhatsAppUrl` → wa.me/55… */
    phoneLocal: "32998064217",
    prefillMessage: "Olá, tenho uma dúvida sobre o PetGestor.",
  },
} as const;

export type Brand = typeof brand;
