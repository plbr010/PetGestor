import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("ativação paga só com payment approved verificado", () => {
  const syncSource = readFileSync(join(process.cwd(), "src/features/subscription/sync.ts"), "utf8");
  const preapprovalFn = syncSource.slice(
    syncSource.indexOf("export async function syncSubscriptionFromProvider"),
    syncSource.indexOf("export async function syncAuthorizedPaymentFromProvider"),
  );
  const authorizedPaymentFn = syncSource.slice(
    syncSource.indexOf("export async function syncAuthorizedPaymentFromProvider"),
    syncSource.indexOf("export async function syncPaymentFromProvider"),
  );

  it("sync de preapproval não cria/renova período pago", () => {
    expect(preapprovalFn).not.toContain("resolvePaidPeriodOnApprovedPayment");
    expect(preapprovalFn).not.toContain("shouldCreateOrRenewPaidPeriod");
    expect(preapprovalFn).not.toContain("assertActivationMatchesPlan");
  });

  it("payment GET approved é obrigatório para ativar período pago", () => {
    expect(authorizedPaymentFn).toContain("getPayment(");
    expect(authorizedPaymentFn).toContain("shouldCreateOrRenewPaidPeriod");
    expect(authorizedPaymentFn).toContain("verifiedPaymentFetched");
    expect(authorizedPaymentFn).toContain("assertActivationMatchesPlan");
    expect(authorizedPaymentFn).toContain("resolvePaidPeriodOnApprovedPayment");
  });

  it("payment avulso não ativa tenant", () => {
    const paymentFn = syncSource.slice(syncSource.indexOf("export async function syncPaymentFromProvider"));
    expect(paymentFn).not.toContain("resolvePaidPeriodOnApprovedPayment");
    expect(paymentFn).toContain("precisa do preapproval local");
  });
});
