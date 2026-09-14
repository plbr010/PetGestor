import {
  computePaidPeriodEnd,
  type BillingInterval,
} from "@/config/subscription";

export function periodCoversAnnualCycle(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): boolean {
  if (!startIso || !endIso) {
    return false;
  }

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }

  return end - start >= 300 * 24 * 60 * 60 * 1000;
}

export function isPaidPeriodValidAt(
  currentPeriodEnd: string | null | undefined,
  now: Date,
): boolean {
  if (!currentPeriodEnd) {
    return false;
  }

  const endMs = new Date(currentPeriodEnd).getTime();
  if (Number.isNaN(endMs)) {
    return false;
  }

  return endMs > now.getTime();
}

/**
 * Renovação:
 * - pagamento com período ainda vigente: estende o fim se next_payment for posterior (não soma meses em cima do restante)
 * - pagamento no/após vencimento: abre período novo a partir do pagamento
 * next_payment_at do provider prevalece quando existe.
 */
export function resolvePaidPeriodOnApprovedPayment(params: {
  billingInterval: BillingInterval;
  now: Date;
  paymentApprovedAt?: Date | null;
  currentPeriodStart: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
  nextPaymentAt: string | null | undefined;
  alreadySubscribed: boolean;
}): {
  subscribed_at?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
} {
  const start = params.paymentApprovedAt ?? params.now;
  const update: {
    subscribed_at?: string;
    current_period_start?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  } = {};

  if (!params.alreadySubscribed) {
    update.subscribed_at = start.toISOString();
  }

  const periodStillValid = isPaidPeriodValidAt(params.currentPeriodEnd, start);
  const nextFromProvider = params.nextPaymentAt ? new Date(params.nextPaymentAt) : null;
  const nextIsValid = nextFromProvider && !Number.isNaN(nextFromProvider.getTime());

  if (periodStillValid && params.currentPeriodEnd) {
    const existingEnd = new Date(params.currentPeriodEnd);
    if (nextIsValid && nextFromProvider.getTime() > existingEnd.getTime()) {
      update.current_period_end = nextFromProvider.toISOString();
    }
    return update;
  }

  update.current_period_start = start.toISOString();
  update.current_period_end = (
    nextIsValid ? nextFromProvider : computePaidPeriodEnd(start, params.billingInterval)
  ).toISOString();
  update.cancel_at_period_end = false;
  return update;
}

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}
