export const brand = {
  name: "PetGestor",
  tagline: "Gestão simples para pet shops",
  description:
    "Organize agenda, tutores, pets e atendimentos em um só lugar. Feito para pet shops que querem crescer com clareza.",
  defaultTitle: "PetGestor — Gestão simples para pet shops",
  defaultDescription:
    "SaaS de gestão para pet shops: agenda, clientes, pets, serviços e financeiro básico.",
  locale: "pt-BR",
  supportWhatsApp: {
    /** Telefone BR (DDD + número) usado em `buildWhatsAppUrl` → wa.me/55… */
    phoneLocal: "32998064217",
    prefillMessage: "Olá, tenho uma dúvida sobre o PetGestor.",
  },
} as const;

export type Brand = typeof brand;
