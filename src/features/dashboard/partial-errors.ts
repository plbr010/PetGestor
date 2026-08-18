export type DashboardPartialError = {
  key: string;
  label: string;
  optional: boolean;
};

export const DASHBOARD_SECTION_LABELS: Record<string, { label: string; optional: boolean }> = {
  customers: { label: "tutores", optional: false },
  pets: { label: "pets", optional: false },
  services: { label: "serviços", optional: false },
  employees: { label: "funcionários", optional: false },
  "appointments-count": { label: "agendamentos de hoje", optional: false },
  "appointments-today": { label: "agenda de hoje", optional: false },
  "appointments-upcoming": { label: "próximos agendamentos", optional: false },
  "orders-waiting": { label: "atendimentos aguardando", optional: false },
  "orders-in-progress": { label: "atendimentos em andamento", optional: false },
  "orders-ready": { label: "atendimentos prontos", optional: false },
  finance: { label: "financeiro", optional: true },
  inventory: { label: "estoque", optional: true },
  pos: { label: "PDV", optional: true },
};

export function formatDashboardPartialErrors(keys: string[]): string | null {
  if (keys.length === 0) {
    return null;
  }

  const core = keys.filter((key) => !DASHBOARD_SECTION_LABELS[key]?.optional);
  const relevant = core.length > 0 ? core : keys;

  const labels = relevant
    .map((key) => DASHBOARD_SECTION_LABELS[key]?.label ?? key)
    .filter(Boolean);

  if (labels.length === 0) {
    return null;
  }

  const unique = [...new Set(labels)];

  if (core.length === 0) {
    return null;
  }

  return `Não foi possível carregar: ${unique.join(", ")}. Verifique migrations pendentes no Supabase ou tente novamente.`;
}
