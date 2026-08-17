export type ScheduleTimeBlock = {
  id: string;
  employee_id: string | null;
  block_start: string;
  block_end: string;
  reason: string;
  employeeName?: string | null;
};

export const TIME_BLOCK_REASONS = [
  "Almoço",
  "Reunião",
  "Manutenção",
  "Folga",
  "Indisponibilidade",
] as const;
