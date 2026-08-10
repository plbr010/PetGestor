import type {
  EmployeeSchedulableFilter,
  EmployeeStatusFilter,
  WorkingHourInput,
} from "@/features/employees/types";

export const WEEKDAYS: { weekday: number; label: string; shortLabel: string }[] = [
  { weekday: 0, label: "Domingo", shortLabel: "Dom" },
  { weekday: 1, label: "Segunda-feira", shortLabel: "Seg" },
  { weekday: 2, label: "Terça-feira", shortLabel: "Ter" },
  { weekday: 3, label: "Quarta-feira", shortLabel: "Qua" },
  { weekday: 4, label: "Quinta-feira", shortLabel: "Qui" },
  { weekday: 5, label: "Sexta-feira", shortLabel: "Sex" },
  { weekday: 6, label: "Sábado", shortLabel: "Sáb" },
];

export function getWeekdayLabel(weekday: number): string {
  return WEEKDAYS.find((day) => day.weekday === weekday)?.label ?? `Dia ${weekday}`;
}

export function parseStatusFilter(value: string | undefined | null): EmployeeStatusFilter {
  if (value === "active" || value === "inactive") {
    return value;
  }

  return "all";
}

export function parseSchedulableFilter(
  value: string | undefined | null,
): EmployeeSchedulableFilter {
  if (value === "yes" || value === "no") {
    return value;
  }

  return "all";
}

export function formatTimeDisplay(value: string | null): string {
  if (!value) {
    return "—";
  }

  return value.slice(0, 5);
}

export function formatWorkingHourRange(
  enabled: boolean,
  startTime: string | null,
  endTime: string | null,
): string {
  if (!enabled) {
    return "Folga";
  }

  if (!startTime || !endTime) {
    return "—";
  }

  return `${formatTimeDisplay(startTime)}–${formatTimeDisplay(endTime)}`;
}

export function formatServicesSummary(services: { serviceName: string }[], maxVisible = 2): string {
  if (services.length === 0) {
    return "Nenhum serviço";
  }

  const visible = services.slice(0, maxVisible).map((service) => service.serviceName);
  const remaining = services.length - visible.length;

  if (remaining > 0) {
    return `${visible.join(", ")} +${remaining}`;
  }

  return visible.join(", ");
}

export function getDefaultWorkingHours(): WorkingHourInput[] {
  return WEEKDAYS.map((day) => {
    if (day.weekday === 0) {
      return { weekday: day.weekday, enabled: false, startTime: null, endTime: null };
    }

    if (day.weekday === 6) {
      return {
        weekday: day.weekday,
        enabled: true,
        startTime: "08:00",
        endTime: "13:00",
      };
    }

    return {
      weekday: day.weekday,
      enabled: true,
      startTime: "08:00",
      endTime: "18:00",
    };
  });
}

export function parseTimeInput(value: FormDataEntryValue | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();

  if (raw.length === 0) {
    return null;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);

  if (!match) {
    return null;
  }

  return `${match[1]}:${match[2]}`;
}

export function parseWorkingHoursFromForm(formData: FormData): WorkingHourInput[] | null {
  const rows: WorkingHourInput[] = [];

  for (const day of WEEKDAYS) {
    const enabled =
      formData.get(`weekday_${day.weekday}_enabled`) === "on" ||
      formData.get(`weekday_${day.weekday}_enabled`) === "true";
    const startTime = parseTimeInput(formData.get(`weekday_${day.weekday}_start`));
    const endTime = parseTimeInput(formData.get(`weekday_${day.weekday}_end`));

    if (enabled) {
      if (!startTime || !endTime) {
        return null;
      }

      if (startTime >= endTime) {
        return null;
      }
    }

    rows.push({
      weekday: day.weekday,
      enabled,
      startTime: enabled ? startTime : null,
      endTime: enabled ? endTime : null,
    });
  }

  return rows;
}

export function workingHoursToRpcPayload(hours: WorkingHourInput[]) {
  return hours.map((hour) => ({
    weekday: hour.weekday,
    enabled: hour.enabled,
    start_time: hour.enabled ? hour.startTime : null,
    end_time: hour.enabled ? hour.endTime : null,
  }));
}

export function schedulableLabel(canBeScheduled: boolean, active: boolean): string {
  if (!active) {
    return "Inativo";
  }

  return canBeScheduled ? "Disponível para agenda" : "Não agendável";
}
