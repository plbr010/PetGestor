/**
 * Regras de jornada + intervalo de almoço (half-open [start, end)).
 * Espelha a validação definitiva no banco (`private.assert_appointment_fits_working_hours`).
 */

export type WorkingHourWindow = {
  enabled: boolean;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
};

export type WorkingHoursFitResult =
  | { ok: true }
  | { ok: false; reason: "no_shift" | "outside_hours" | "lunch_break" };

export function parseTimeToMinutes(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Minutos de capacidade da jornada, já descontado o intervalo válido.
 * Intervalo half-open [breakStart, breakEnd) intersectado com [start, end).
 */
export function shiftCapacityMinutes(window: WorkingHourWindow): number {
  if (!window.enabled) {
    return 0;
  }

  const start = parseTimeToMinutes(window.startTime);
  const end = parseTimeToMinutes(window.endTime);

  if (start === null || end === null || end <= start) {
    return 0;
  }

  let minutes = end - start;
  const breakStart = parseTimeToMinutes(window.breakStart);
  const breakEnd = parseTimeToMinutes(window.breakEnd);

  if (breakStart !== null && breakEnd !== null && breakEnd > breakStart) {
    const overlapStart = Math.max(start, breakStart);
    const overlapEnd = Math.min(end, breakEnd);
    if (overlapEnd > overlapStart) {
      minutes -= overlapEnd - overlapStart;
    }
  }

  return Math.max(0, minutes);
}

/** Sobreposição half-open: [a, b) ∩ [c, d) ≠ ∅ */
export function rangesOverlapHalfOpen(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}

export function appointmentOverlapsBreak(
  startMinutes: number,
  endMinutes: number,
  breakStart: string | null,
  breakEnd: string | null,
): boolean {
  const breakStartMinutes = parseTimeToMinutes(breakStart);
  const breakEndMinutes = parseTimeToMinutes(breakEnd);

  if (breakStartMinutes === null || breakEndMinutes === null) {
    return false;
  }

  return rangesOverlapHalfOpen(
    startMinutes,
    endMinutes,
    breakStartMinutes,
    breakEndMinutes,
  );
}

export function appointmentFitsWorkingHours(input: {
  startTime: string;
  durationMinutes: number;
  window: WorkingHourWindow | null;
}): WorkingHoursFitResult {
  const window = input.window;
  const startMinutes = parseTimeToMinutes(input.startTime);
  const workStart = parseTimeToMinutes(window?.startTime ?? null);
  const workEnd = parseTimeToMinutes(window?.endTime ?? null);

  if (
    !window?.enabled ||
    startMinutes === null ||
    workStart === null ||
    workEnd === null ||
    input.durationMinutes <= 0
  ) {
    return { ok: false, reason: "no_shift" };
  }

  const endMinutes = startMinutes + input.durationMinutes;

  if (startMinutes < workStart || endMinutes > workEnd) {
    return { ok: false, reason: "outside_hours" };
  }

  if (appointmentOverlapsBreak(startMinutes, endMinutes, window.breakStart, window.breakEnd)) {
    return { ok: false, reason: "lunch_break" };
  }

  return { ok: true };
}

export function slotSurvivesWorkingHours(
  slot: string,
  durationMinutes: number,
  window: WorkingHourWindow | null,
): boolean {
  return appointmentFitsWorkingHours({
    startTime: slot,
    durationMinutes,
    window,
  }).ok;
}
