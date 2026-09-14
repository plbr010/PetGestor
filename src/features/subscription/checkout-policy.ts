import {
  parseBillingInterval,
  type BillingInterval,
} from "@/config/subscription";

export type BillingMutationDenial =
  | "revoked"
  | "forbidden"
  | "cross_tenant"
  | "invalid_plan";

export type BillingMutationActor = {
  companyId: string;
  accessRevoked: boolean;
  canManageSubscription: boolean;
  isPlatformAdmin?: boolean;
};

export type CheckoutClientInput = {
  billingInterval: BillingInterval;
  ignoredAmount: boolean;
  ignoredCompanyId: boolean;
};

/**
 * O browser só pode pedir o identificador de plano. amount/company_id do body
 * nunca autorizam nem precificam — o servidor ignora e usa o tenant autenticado.
 */
export function parseCheckoutClientInput(input: {
  plan?: unknown;
  amount?: unknown;
  price?: unknown;
  companyId?: unknown;
  company_id?: unknown;
}): { ok: true; value: CheckoutClientInput } | { ok: false; reason: "invalid_plan" } {
  const ignoredAmount = input.amount !== undefined || input.price !== undefined;
  const ignoredCompanyId = input.companyId !== undefined || input.company_id !== undefined;

  try {
    const billingInterval = parseBillingInterval(input.plan ?? "monthly");
    return {
      ok: true,
      value: {
        billingInterval,
        ignoredAmount,
        ignoredCompanyId,
      },
    };
  } catch {
    return { ok: false, reason: "invalid_plan" };
  }
}

export function parseCheckoutFormData(formData: FormData): ReturnType<typeof parseCheckoutClientInput> {
  return parseCheckoutClientInput({
    plan: formData.get("plan"),
    amount: formData.has("amount") ? formData.get("amount") : undefined,
    price: formData.has("price") ? formData.get("price") : undefined,
    companyId: formData.has("companyId") ? formData.get("companyId") : undefined,
    company_id: formData.has("company_id") ? formData.get("company_id") : undefined,
  });
}

export function authorizeBillingMutation(
  actor: BillingMutationActor,
  targetCompanyId: string,
): { ok: true } | { ok: false; reason: BillingMutationDenial } {
  if (actor.accessRevoked) {
    return { ok: false, reason: "revoked" };
  }

  if (actor.companyId !== targetCompanyId) {
    return { ok: false, reason: "cross_tenant" };
  }

  if (actor.isPlatformAdmin) {
    return { ok: true };
  }

  if (!actor.canManageSubscription) {
    return { ok: false, reason: "forbidden" };
  }

  return { ok: true };
}

/** Checkout sempre opera sobre a empresa do contexto autenticado. */
export function resolveCheckoutCompanyId(actorCompanyId: string): string {
  return actorCompanyId;
}

export function buildCheckoutIdempotencyKey(params: {
  companyId: string;
  billingInterval: BillingInterval;
  replacingProviderSubscriptionId?: string | null;
}): string {
  const base = `petgestor-checkout-${params.companyId}-${params.billingInterval}`;
  if (params.replacingProviderSubscriptionId) {
    return `${base}-after-${params.replacingProviderSubscriptionId}`;
  }
  return base;
}

export function shouldReuseCheckoutIdempotencyKey(
  existingKey: string | null | undefined,
  reusablePending: boolean,
): existingKey is string {
  return Boolean(reusablePending && existingKey);
}
