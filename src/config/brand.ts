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
    /** Número E.164 sem `+` (wa.me). */
    phoneDigits: "5532998064217",
    /** Telefone BR local para `buildWhatsAppUrl`. */
    phoneLocal: "32998064217",
    prefillMessage: "Olá, tenho uma dúvida sobre o PetGestor.",
  },
} as const;

export type Brand = typeof brand;
