import { demoPetShop } from "@/config/demo-data";

/**
 * Credenciais padrão da conta demonstrativa.
 * Use apenas em ambientes de desenvolvimento/staging — nunca em produção real.
 */
export const DEMO_ACCOUNT = {
  email: "mariana+demo@demo.petgestor.app",
  password: "PetGestorDemo2026!",
  ownerName: demoPetShop.ownerName,
  companyName: demoPetShop.name,
  phone: "11987654321",
} as const;

export const DEMO_TIMEZONE = "America/Sao_Paulo" as const;

export const DEMO_CUSTOMERS = [
  {
    key: "ana",
    name: "Ana Silva",
    phone: "11999887766",
    email: "ana.silva@email.com",
    notes: "Cliente desde 2023. Prefere agendamentos pela manhã.",
  },
  {
    key: "carlos",
    name: "Carlos Mendes",
    phone: "11988776655",
    email: "carlos.mendes@email.com",
    notes: "Traz a Luna para consultas veterinárias mensais.",
  },
  {
    key: "juliana",
    name: "Juliana Costa",
    phone: "11977665544",
    email: "juliana.costa@email.com",
    notes: null,
  },
  {
    key: "roberto",
    name: "Roberto Lima",
    phone: "11966554433",
    email: null,
    notes: "Sempre pede tosa higiênica no Bob.",
  },
  {
    key: "fernanda",
    name: "Fernanda Alves",
    phone: "11955443322",
    email: "fernanda.alves@email.com",
    notes: "Comprou pacote de banhos para a Nina.",
  },
] as const;

export const DEMO_PETS = [
  {
    key: "thor",
    customerKey: "ana",
    name: "Thor",
    species: "dog" as const,
    breed: "Golden Retriever",
    sex: "male" as const,
    weightKg: 32.5,
    color: "Dourado",
    allergies: "Nenhuma conhecida",
    notes: "Muito dócil. Gosta de banho morno.",
    importantNotes: "Vacinas em dia. Vermífugo aplicado em jan/2026.",
    size: "large" as const,
  },
  {
    key: "luna",
    customerKey: "carlos",
    name: "Luna",
    species: "dog" as const,
    breed: "SRD",
    sex: "female" as const,
    weightKg: 12.0,
    color: "Caramelo",
    allergies: null,
    notes: null,
    importantNotes: "Histórico de alergia a shampoo com perfume forte.",
    size: "medium" as const,
  },
  {
    key: "mel",
    customerKey: "juliana",
    name: "Mel",
    species: "dog" as const,
    breed: "Poodle",
    sex: "female" as const,
    weightKg: 6.8,
    color: "Branco",
    allergies: null,
    notes: "Pelagem sensível.",
    importantNotes: null,
    size: "small" as const,
  },
  {
    key: "bob",
    customerKey: "roberto",
    name: "Bob",
    species: "dog" as const,
    breed: "Bulldog Francês",
    sex: "male" as const,
    weightKg: 11.2,
    color: "Tigrado",
    allergies: "Calor intenso",
    notes: null,
    importantNotes: "Branquicefálico — evitar esforço no calor.",
    size: "medium" as const,
  },
  {
    key: "nina",
    customerKey: "fernanda",
    name: "Nina",
    species: "cat" as const,
    breed: "Persa",
    sex: "female" as const,
    weightKg: 4.5,
    color: "Cinza",
    allergies: null,
    notes: "Gata de interior.",
    importantNotes: null,
    size: "small" as const,
  },
] as const;

export const DEMO_SERVICES = [
  {
    key: "banho-tosa",
    name: "Banho e tosa",
    description: "Banho completo com tosa higiênica e secagem.",
    pricingMode: "by_size" as const,
    durationMinutes: 90,
    sizePrices: [
      { size: "small" as const, priceCents: 8500, durationMinutes: 75 },
      { size: "medium" as const, priceCents: 10500, durationMinutes: 90 },
      { size: "large" as const, priceCents: 13500, durationMinutes: 105 },
      { size: "giant" as const, priceCents: 16500, durationMinutes: 120 },
    ],
  },
  {
    key: "consulta-vet",
    name: "Consulta veterinária",
    description: "Avaliação clínica com profissional parceiro.",
    pricingMode: "fixed" as const,
    priceCents: 12000,
    durationMinutes: 45,
  },
  {
    key: "hidratacao",
    name: "Hidratação",
    description: "Máscara hidratante para pelos ressecados.",
    pricingMode: "fixed" as const,
    priceCents: 6500,
    durationMinutes: 30,
  },
  {
    key: "tosa-higienica",
    name: "Tosa higiênica",
    description: "Tosa nas áreas íntimas, patas e focinho.",
    pricingMode: "fixed" as const,
    priceCents: 5500,
    durationMinutes: 40,
  },
] as const;

export const DEMO_EMPLOYEES = [
  {
    key: "rafaela",
    name: "Rafaela Souza",
    phone: "11991234567",
    email: "rafaela@amigofiel.local",
    jobTitle: "Tosadora",
    serviceKeys: ["banho-tosa", "hidratacao", "tosa-higienica"] as const,
  },
  {
    key: "pedro",
    name: "Pedro Henrique",
    phone: "11992345678",
    email: "pedro@amigofiel.local",
    jobTitle: "Banhista",
    serviceKeys: ["banho-tosa", "hidratacao", "consulta-vet"] as const,
  },
  {
    key: "camila",
    name: "Camila Rocha",
    phone: "11993456789",
    email: "camila@amigofiel.local",
    jobTitle: "Recepcionista",
    serviceKeys: ["consulta-vet"] as const,
    canBeScheduled: false,
  },
] as const;

export const DEMO_INVENTORY = {
  categories: [
    { key: "higiene", name: "Higiene" },
    { key: "alimentacao", name: "Alimentação" },
    { key: "acessorios", name: "Acessórios" },
  ],
  suppliers: [
    {
      key: "petmax",
      name: "PetMax Distribuidora",
      phone: "1133334444",
      email: "vendas@petmax.com.br",
      notes: "Entrega às terças e quintas.",
    },
    {
      key: "agropet",
      name: "AgroPet Sul",
      phone: "1144445555",
      email: null,
      notes: null,
    },
  ],
  products: [
    {
      key: "shampoo",
      name: "Shampoo Neutro 500ml",
      sku: "SHP-NEU-500",
      categoryKey: "higiene",
      unit: "unit" as const,
      costPriceCents: 1800,
      salePriceCents: 3200,
      minimumStock: 5,
      initialStock: 24,
    },
    {
      key: "condicionador",
      name: "Condicionador Hidratante 500ml",
      sku: "CND-HID-500",
      categoryKey: "higiene",
      unit: "unit" as const,
      costPriceCents: 2200,
      salePriceCents: 3800,
      minimumStock: 4,
      initialStock: 18,
    },
    {
      key: "racao-premium",
      name: "Ração Premium 10kg",
      sku: "RAC-PRM-10",
      categoryKey: "alimentacao",
      unit: "unit" as const,
      costPriceCents: 14500,
      salePriceCents: 18900,
      minimumStock: 3,
      initialStock: 12,
    },
    {
      key: "coleira",
      name: "Coleira Ajustável M",
      sku: "COL-AJU-M",
      categoryKey: "acessorios",
      unit: "unit" as const,
      costPriceCents: 1200,
      salePriceCents: 2490,
      minimumStock: 6,
      initialStock: 3,
    },
  ],
} as const;

export const DEMO_SERVICE_PACKAGE = {
  name: "Pacote 4 Banhos",
  description: "Quatro banhos com desconto — válido por 90 dias.",
  priceCents: 32000,
  validityDays: 90,
  items: [{ serviceKey: "banho-tosa", quantity: 4 }],
} as const;

export const DEMO_FINANCE = {
  incomes: [
    {
      description: "Venda balcão — ração e acessórios",
      category: "PDV",
      amountCents: 21390,
      status: "paid" as const,
      paymentMethod: "pix" as const,
    },
    {
      description: "Pacote 4 banhos — Fernanda",
      category: "Pacotes",
      amountCents: 32000,
      status: "paid" as const,
      paymentMethod: "credit_card" as const,
    },
    {
      description: "Banho Thor — pendente",
      category: "Serviços",
      amountCents: 13500,
      status: "pending" as const,
      paymentMethod: null,
    },
  ],
  expenses: [
    {
      description: "Reposição de shampoos e condicionadores",
      category: "Estoque",
      amountCents: 89000,
      status: "paid" as const,
      paymentMethod: "bank_transfer" as const,
    },
    {
      description: "Aluguel do ponto — mês atual",
      category: "Fixos",
      amountCents: 350000,
      status: "pending" as const,
      paymentMethod: null,
    },
  ],
} as const;

/** Horários de agendamento demonstrativos (HH:mm) no fuso da empresa. */
export const DEMO_APPOINTMENT_SLOTS = [
  { petKey: "thor", serviceKey: "banho-tosa", employeeKey: "rafaela", time: "08:30" },
  { petKey: "luna", serviceKey: "consulta-vet", employeeKey: "pedro", time: "10:00" },
  { petKey: "mel", serviceKey: "hidratacao", employeeKey: "pedro", time: "11:30" },
  { petKey: "bob", serviceKey: "tosa-higienica", employeeKey: "rafaela", time: "14:00" },
  { petKey: "nina", serviceKey: "banho-tosa", employeeKey: "pedro", time: "16:00" },
] as const;
