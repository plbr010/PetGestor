export const GLOBAL_SEARCH_MIN_CHARS = 2;
export const GLOBAL_SEARCH_DEBOUNCE_MS = 300;
export const GLOBAL_SEARCH_LIMIT_PER_GROUP = 5;
/** Busca 1 a mais para saber se há “Ver todos”. */
export const GLOBAL_SEARCH_FETCH_PER_GROUP = GLOBAL_SEARCH_LIMIT_PER_GROUP + 1;

export const GLOBAL_SEARCH_GROUP_IDS = [
  "customers",
  "pets",
  "appointments",
  "service_orders",
  "employees",
  "services",
  "products",
  "sales",
  "packages",
] as const;

export type GlobalSearchGroupId = (typeof GLOBAL_SEARCH_GROUP_IDS)[number];

export type GlobalSearchItem = {
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** Menor = mais relevante */
  rank: number;
};

export type GlobalSearchGroup = {
  id: GlobalSearchGroupId;
  label: string;
  /** Lista filtrada da categoria (quando “Ver todos”). */
  hrefAll: string | null;
  hasMore: boolean;
  items: GlobalSearchItem[];
};

export type GlobalSearchResult = {
  query: string;
  groups: GlobalSearchGroup[];
};

export const GLOBAL_SEARCH_GROUP_LABELS: Record<GlobalSearchGroupId, string> = {
  customers: "Clientes",
  pets: "Pets",
  appointments: "Agendamentos",
  service_orders: "Atendimentos",
  employees: "Funcionários",
  services: "Serviços",
  products: "Produtos",
  sales: "Vendas",
  packages: "Pacotes",
};
