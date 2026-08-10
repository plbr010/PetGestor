import { TRIAL_DURATION_HOURS } from "@/config/subscription";

export function formatTrialRemaining(trialEndsAt: string, serverNow: Date): string {
  const remainingMs = new Date(trialEndsAt).getTime() - serverNow.getTime();

  if (remainingMs <= 0) {
    return "encerrado";
  }

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (totalHours >= 24) {
    const dayLabel = days === 1 ? "dia" : "dias";
    const hourLabel = hours === 1 ? "hora" : "horas";
    return `${days} ${dayLabel} e ${hours} ${hourLabel}`;
  }

  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

export function formatTrialBannerMessage(trialEndsAt: string, serverNow: Date): string {
  const remainingMs = new Date(trialEndsAt).getTime() - serverNow.getTime();
  const totalHours = Math.floor(remainingMs / 3_600_000);

  if (totalHours >= 24) {
    return `Seu teste grátis termina em ${formatTrialRemaining(trialEndsAt, serverNow)}.`;
  }

  return `Seu teste grátis termina em ${formatTrialRemaining(trialEndsAt, serverNow)}.`;
}

export function formatDateTimeInTimezone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function getTrialDurationHoursForTests(): number {
  return TRIAL_DURATION_HOURS;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function msBetween(start: Date, end: Date): number {
  return end.getTime() - start.getTime();
}
