import {
  computeAvailableStock,
  roundQuantity,
  type StockBatchState,
} from "@/features/inventory/stock-engine";
import {
  computeDiscountCents,
  settleCheckoutPayments,
  type DiscountInput,
} from "@/features/pos/cart-engine";
import type { SalePaymentInput } from "@/features/pos/types";
import type { DiscountType, PaymentMethod, SaleStatus } from "@/types/database.types";

export const MAX_SALE_AMOUNT_CENTS = 99_999_999;

export type CheckoutActor = {
  userId: string;
  companyId: string;
  permissions: string[];
  accessRevokedAt: string | null;
};

export type CatalogProduct = {
  id: string;
  companyId: string;
  name: string;
  salePriceCents: number;
  costPriceCents: number;
  currentStock: number;
  trackStock: boolean;
  active: boolean;
  archivedAt: string | null;
  batches: StockBatchState[];
};

export type CheckoutItemInput = {
  productId: string;
  quantity: number;
  unitPriceCents?: number;
};

export type CheckoutRequest = {
  companyId: string;
  idempotencyKey: string;
  items: CheckoutItemInput[];
  payments: SalePaymentInput[];
  customerId: string | null;
  discount: DiscountInput;
  cashReceivedCents: number | null;
};

export type SaleRecord = {
  id: string;
  companyId: string;
  idempotencyKey: string;
  checkoutFingerprint: string;
  customerId: string | null;
  status: SaleStatus;
  subtotalCents: number;
  discountCents: number;
  discountType: DiscountType | null;
  discountPercent: number | null;
  totalCents: number;
  paidCents: number;
  changeCents: number;
  cashReceivedCents: number;
  cashSessionId: string | null;
  financialEntryId: string | null;
  cancelledAt: string | null;
};

export type SaleItemRecord = {
  id: string;
  saleId: string;
  companyId: string;
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  costPriceCentsSnapshot: number;
  subtotalCents: number;
  totalCents: number;
};

export type FinancialEntryRecord = {
  id: string;
  companyId: string;
  saleId: string;
  sourceType: "sale";
  amountCents: number;
  status: "pending" | "partially_paid" | "paid" | "cancelled";
};

export type FinancialPaymentRecord = {
  id: string;
  companyId: string;
  financialEntryId: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  cancelledAt: string | null;
};

export type StockMovementRecord = {
  id: string;
  companyId: string;
  productId: string;
  type: "sale" | "return";
  quantity: number;
  idempotencyKey: string;
  referenceId: string;
};

export type CashSessionRecord = {
  id: string;
  companyId: string;
  status: "open" | "closed";
};

export type CheckoutFailAfter = "sale" | "items" | "stock" | "financial_entry" | "payment";

export type CheckoutResult =
  | { ok: true; saleId: string; created: boolean }
  | { ok: false; error: string };

type StoreSnapshot = {
  products: CatalogProduct[];
  sales: SaleRecord[];
  saleItems: SaleItemRecord[];
  entries: FinancialEntryRecord[];
  payments: FinancialPaymentRecord[];
  movements: StockMovementRecord[];
  cashSessions: CashSessionRecord[];
  nextId: number;
};

function canonicalQuantity(value: number): string {
  return roundQuantity(value).toFixed(3);
}

export function saleCheckoutFingerprint(input: {
  items: { productId: string; quantity: number }[];
  customerId: string | null;
  discountType: DiscountType | null;
  discountFixedCents: number;
  discountPercent: number | null;
  payments: { paymentMethod: string; amountCents: number }[];
  cashReceivedCents: number | null;
  cashSessionId: string | null;
}): string {
  const merged = new Map<string, number>();
  for (const item of input.items) {
    merged.set(item.productId, roundQuantity((merged.get(item.productId) ?? 0) + item.quantity));
  }

  const itemPart = [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => `${productId}:${canonicalQuantity(quantity)}`)
    .join(",");

  const discountPart = `${input.discountType ?? ""}:${input.discountFixedCents}:${
    input.discountPercent == null ? "" : input.discountPercent.toFixed(2)
  }`;

  const paymentPart = [...input.payments]
    .map((payment) => ({
      method: payment.paymentMethod,
      amount: payment.amountCents,
    }))
    .sort((a, b) => a.method.localeCompare(b.method) || a.amount - b.amount)
    .map((payment) => `${payment.method}:${payment.amount}`)
    .join(",");

  return [
    `items=${itemPart}`,
    `customer=${input.customerId ?? ""}`,
    `discount=${discountPart}`,
    `payments=${paymentPart}`,
    `cash=${input.cashReceivedCents ?? 0}`,
    `session=${input.cashSessionId ?? ""}`,
  ].join("|");
}

export function createCheckoutActor(
  companyId: string,
  overrides: Partial<CheckoutActor> = {},
): CheckoutActor {
  return {
    userId: overrides.userId ?? "user-1",
    companyId,
    permissions: overrides.permissions ?? ["pos.use", "pos.apply_discount", "pos.receive_payment"],
    accessRevokedAt: overrides.accessRevokedAt ?? null,
  };
}

export class PosCheckoutStore {
  products = new Map<string, CatalogProduct>();
  sales: SaleRecord[] = [];
  saleItems: SaleItemRecord[] = [];
  entries: FinancialEntryRecord[] = [];
  payments: FinancialPaymentRecord[] = [];
  movements: StockMovementRecord[] = [];
  cashSessions: CashSessionRecord[] = [];
  failAfter: CheckoutFailAfter | null = null;
  today = "2026-09-11";
  private nextId = 1;
  private productLocks = new Set<string>();

  addProduct(product: CatalogProduct) {
    this.products.set(product.id, {
      ...product,
      batches: product.batches.map((batch) => ({ ...batch })),
    });
  }

  openCashSession(companyId: string, id = `cash-${companyId}`) {
    this.cashSessions = this.cashSessions.filter(
      (session) => !(session.companyId === companyId && session.status === "open"),
    );
    this.cashSessions.push({ id, companyId, status: "open" });
    return id;
  }

  checkout(actor: CheckoutActor, request: CheckoutRequest): CheckoutResult {
    const snapshot = this.snapshot();

    try {
      return this.checkoutTx(actor, request);
    } catch (error) {
      this.restore(snapshot);
      if (error instanceof AbortCheckoutError) {
        return { ok: false, error: "checkout_aborted" };
      }
      throw error;
    }
  }

  checkoutConcurrent(
    actor: CheckoutActor,
    first: CheckoutRequest,
    second: CheckoutRequest,
  ): { first: CheckoutResult; second: CheckoutResult } {
    return {
      first: this.checkout(actor, first),
      second: this.checkout(actor, second),
    };
  }

  cancelSale(actor: CheckoutActor, saleId: string): CheckoutResult {
    if (!this.hasPermission(actor, "pos.cancel_sale")) {
      return { ok: false, error: "insufficient_permission" };
    }

    const sale = this.sales.find((row) => row.id === saleId);
    if (!sale || sale.companyId !== actor.companyId) {
      return { ok: false, error: "not_found" };
    }

    if (sale.cancelledAt) {
      return { ok: false, error: "sale_already_cancelled" };
    }

    const entryPayments = this.payments.filter(
      (payment) => payment.financialEntryId === sale.financialEntryId && payment.cancelledAt == null,
    );

    if (
      sale.paidCents > 0 ||
      entryPayments.length > 0 ||
      sale.status === "completed" ||
      sale.status === "partially_paid"
    ) {
      return { ok: false, error: "sale_paid_requires_refund" };
    }

    sale.status = "cancelled";
    sale.cancelledAt = `${this.today}T12:00:00.000Z`;
    return { ok: true, saleId: sale.id, created: false };
  }

  registerSalePayment(
    actor: CheckoutActor,
    input: {
      saleId: string;
      amountCents: number;
      paymentMethod: PaymentMethod;
      idempotencyKey: string;
    },
  ): CheckoutResult {
    if (!this.hasPermission(actor, "pos.receive_payment")) {
      return { ok: false, error: "insufficient_permission" };
    }

    const existing = this.payments.find(
      (payment) =>
        payment.companyId === actor.companyId &&
        payment.idempotencyKey === input.idempotencyKey &&
        payment.cancelledAt == null,
    );

    if (existing) {
      return { ok: true, saleId: input.saleId, created: false };
    }

    const sale = this.sales.find((row) => row.id === input.saleId);
    if (!sale || sale.companyId !== actor.companyId) {
      return { ok: false, error: "not_found" };
    }

    if (sale.cancelledAt) {
      return { ok: false, error: "sale_already_cancelled" };
    }

    const received = this.activeReceived(sale);
    const remaining = sale.totalCents - received;
    if (remaining <= 0) {
      return { ok: false, error: "sale_already_paid" };
    }

    if (input.amountCents > remaining) {
      return { ok: false, error: "payment_exceeds_balance" };
    }

    if (input.paymentMethod === "cash") {
      const session = this.openSessionFor(actor.companyId);
      if (!session) {
        return { ok: false, error: "cash_session_required" };
      }
    }

    if (!sale.financialEntryId) {
      return { ok: false, error: "sale_missing_financial_entry" };
    }

    this.payments.push({
      id: this.id("pay"),
      companyId: actor.companyId,
      financialEntryId: sale.financialEntryId,
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod,
      idempotencyKey: input.idempotencyKey,
      cancelledAt: null,
    });

    sale.paidCents = this.activeReceived(sale);
    sale.status = sale.paidCents >= sale.totalCents ? "completed" : "partially_paid";
    this.syncEntry(sale);
    return { ok: true, saleId: sale.id, created: true };
  }

  private checkoutTx(actor: CheckoutActor, request: CheckoutRequest): CheckoutResult {
    if (actor.accessRevokedAt) {
      return { ok: false, error: "not_found" };
    }

    if (request.companyId !== actor.companyId || !this.hasPermission(actor, "pos.use")) {
      return { ok: false, error: "not_found" };
    }

    if (!request.idempotencyKey) {
      return { ok: false, error: "invalid_idempotency_key" };
    }

    const fingerprint = saleCheckoutFingerprint({
      items: request.items,
      customerId: request.customerId,
      discountType: request.discount.type,
      discountFixedCents: request.discount.fixedCents,
      discountPercent: request.discount.percent,
      payments: request.payments,
      cashReceivedCents: request.cashReceivedCents,
      cashSessionId: null,
    });

    const existing = this.sales.find(
      (sale) => sale.companyId === actor.companyId && sale.idempotencyKey === request.idempotencyKey,
    );

    if (existing) {
      if (existing.checkoutFingerprint !== fingerprint) {
        return { ok: false, error: "idempotency_key_conflict" };
      }
      return { ok: true, saleId: existing.id, created: false };
    }

    const cashNeeded = request.payments.some((payment) => payment.paymentMethod === "cash");
    const cashSession = cashNeeded ? this.openSessionFor(actor.companyId) : null;
    if (cashNeeded && !cashSession) {
      return { ok: false, error: "cash_session_required" };
    }

    if (request.items.length === 0) {
      return { ok: false, error: "empty_sale_items" };
    }

    const mergedItems = this.mergeItems(request.items);
    const pricedItems: Array<{
      product: CatalogProduct;
      quantity: number;
      unitPriceCents: number;
      lineSubtotal: number;
    }> = [];

    let subtotal = 0;
    const productIds = [...mergedItems.keys()].sort();

    for (const productId of productIds) {
      const quantity = mergedItems.get(productId) ?? 0;
      if (quantity <= 0) {
        return { ok: false, error: "invalid_quantity" };
      }

      const locked = this.lockProduct(productId);
      if (!locked || locked.companyId !== actor.companyId || !locked.active || locked.archivedAt) {
        this.unlockAll();
        return { ok: false, error: "not_found" };
      }

      if (locked.salePriceCents <= 0 || locked.salePriceCents > MAX_SALE_AMOUNT_CENTS) {
        this.unlockAll();
        return { ok: false, error: "invalid_price_cents" };
      }

      if (locked.trackStock) {
        const available = computeAvailableStock(locked.currentStock, locked.batches, this.today);
        if (quantity > available) {
          this.unlockAll();
          return { ok: false, error: "insufficient_stock" };
        }
      }

      const lineSubtotal = Math.round(quantity * locked.salePriceCents);
      if (lineSubtotal > MAX_SALE_AMOUNT_CENTS || subtotal + lineSubtotal > MAX_SALE_AMOUNT_CENTS) {
        this.unlockAll();
        return { ok: false, error: "amount_overflow" };
      }

      subtotal += lineSubtotal;
      pricedItems.push({
        product: locked,
        quantity,
        unitPriceCents: locked.salePriceCents,
        lineSubtotal,
      });
    }

    if (request.discount.type && request.discount.type !== "fixed" && request.discount.type !== "percent") {
      this.unlockAll();
      return { ok: false, error: "invalid_discount" };
    }

    if (request.discount.type === "percent") {
      const percent = request.discount.percent;
      if (percent == null || percent < 0 || percent > 100) {
        this.unlockAll();
        return { ok: false, error: "invalid_discount" };
      }
    }

    const discountCents = computeDiscountCents(subtotal, request.discount);
    if (discountCents > subtotal) {
      this.unlockAll();
      return { ok: false, error: "discount_exceeds_subtotal" };
    }

    if (discountCents > 0 && !this.hasPermission(actor, "pos.apply_discount")) {
      this.unlockAll();
      return { ok: false, error: "discount_permission_required" };
    }

    const totalCents = subtotal - discountCents;
    if (totalCents <= 0) {
      this.unlockAll();
      return { ok: false, error: "sale_total_zero" };
    }

    const settled = settleCheckoutPayments(totalCents, request.payments, request.cashReceivedCents);
    if (!settled.ok) {
      this.unlockAll();
      return { ok: false, error: settled.error };
    }

    const saleId = this.id("sale");
    const sale: SaleRecord = {
      id: saleId,
      companyId: actor.companyId,
      idempotencyKey: request.idempotencyKey,
      checkoutFingerprint: fingerprint,
      customerId: request.customerId,
      status: settled.value.paidCents >= totalCents ? "completed" : "partially_paid",
      subtotalCents: subtotal,
      discountCents,
      discountType: request.discount.type,
      discountPercent: request.discount.percent,
      totalCents,
      paidCents: settled.value.paidCents,
      changeCents: settled.value.changeCents,
      cashReceivedCents: settled.value.cashReceivedCents,
      cashSessionId: cashNeeded ? cashSession?.id ?? null : null,
      financialEntryId: null,
      cancelledAt: null,
    };

    this.sales.push(sale);
    this.abortIf("sale");

    for (const item of pricedItems) {
      this.saleItems.push({
        id: this.id("item"),
        saleId,
        companyId: actor.companyId,
        productId: item.product.id,
        productNameSnapshot: item.product.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        costPriceCentsSnapshot: item.product.costPriceCents,
        subtotalCents: item.lineSubtotal,
        totalCents: item.lineSubtotal,
      });
    }
    this.abortIf("items");

    for (const item of pricedItems) {
      if (!item.product.trackStock) {
        continue;
      }

      const deducted = this.deductStockAtomic(item.product, item.quantity);
      if (!deducted) {
        this.unlockAll();
        throw new AbortCheckoutError();
      }

      this.movements.push({
        id: this.id("mov"),
        companyId: actor.companyId,
        productId: item.product.id,
        type: "sale",
        quantity: item.quantity,
        idempotencyKey: `${request.idempotencyKey}:${item.product.id}`,
        referenceId: saleId,
      });
    }
    this.abortIf("stock");

    const entryId = this.id("fe");
    this.entries.push({
      id: entryId,
      companyId: actor.companyId,
      saleId,
      sourceType: "sale",
      amountCents: totalCents,
      status: "pending",
    });
    sale.financialEntryId = entryId;
    this.abortIf("financial_entry");

    for (const payment of settled.value.appliedPayments) {
      this.payments.push({
        id: this.id("pay"),
        companyId: actor.companyId,
        financialEntryId: entryId,
        amountCents: payment.amountCents,
        paymentMethod: payment.paymentMethod,
        idempotencyKey: payment.idempotencyKey,
        cancelledAt: null,
      });
    }
    this.abortIf("payment");

    this.syncEntry(sale);
    this.unlockAll();
    return { ok: true, saleId, created: true };
  }

  private deductStockAtomic(product: CatalogProduct, quantity: number): boolean {
    const available = computeAvailableStock(product.currentStock, product.batches, this.today);
    const previous = product.currentStock;
    const nextStock = roundQuantity(previous - quantity);

    if (quantity > available || nextStock < 0) {
      return false;
    }

    product.currentStock = nextStock;
    return product.currentStock >= 0;
  }

  private mergeItems(items: CheckoutItemInput[]): Map<string, number> {
    const merged = new Map<string, number>();
    for (const item of items) {
      merged.set(item.productId, roundQuantity((merged.get(item.productId) ?? 0) + item.quantity));
    }
    return merged;
  }

  private lockProduct(productId: string): CatalogProduct | null {
    if (this.productLocks.has(productId)) {
      return this.products.get(productId) ?? null;
    }
    this.productLocks.add(productId);
    return this.products.get(productId) ?? null;
  }

  private unlockAll() {
    this.productLocks.clear();
  }

  private openSessionFor(companyId: string): CashSessionRecord | undefined {
    return this.cashSessions.find((session) => session.companyId === companyId && session.status === "open");
  }

  private hasPermission(actor: CheckoutActor, permission: string): boolean {
    if (actor.accessRevokedAt) {
      return false;
    }
    return actor.permissions.includes(permission);
  }

  private activeReceived(sale: SaleRecord): number {
    return this.payments
      .filter(
        (payment) => payment.financialEntryId === sale.financialEntryId && payment.cancelledAt == null,
      )
      .reduce((sum, payment) => sum + payment.amountCents, 0);
  }

  private syncEntry(sale: SaleRecord) {
    const entry = this.entries.find((row) => row.id === sale.financialEntryId);
    if (!entry) {
      return;
    }

    const received = this.activeReceived(sale);
    if (received <= 0) {
      entry.status = "pending";
    } else if (received >= entry.amountCents) {
      entry.status = "paid";
    } else {
      entry.status = "partially_paid";
    }
  }

  private abortIf(step: CheckoutFailAfter) {
    if (this.failAfter === step) {
      throw new AbortCheckoutError();
    }
  }

  private id(prefix: string): string {
    this.nextId += 1;
    return `${prefix}-${this.nextId}`;
  }

  private snapshot(): StoreSnapshot {
    return {
      products: [...this.products.values()].map((product) => ({
        ...product,
        batches: product.batches.map((batch) => ({ ...batch })),
      })),
      sales: this.sales.map((sale) => ({ ...sale })),
      saleItems: this.saleItems.map((item) => ({ ...item })),
      entries: this.entries.map((entry) => ({ ...entry })),
      payments: this.payments.map((payment) => ({ ...payment })),
      movements: this.movements.map((movement) => ({ ...movement })),
      cashSessions: this.cashSessions.map((session) => ({ ...session })),
      nextId: this.nextId,
    };
  }

  private restore(snapshot: StoreSnapshot) {
    this.products = new Map(snapshot.products.map((product) => [product.id, product]));
    this.sales = snapshot.sales;
    this.saleItems = snapshot.saleItems;
    this.entries = snapshot.entries;
    this.payments = snapshot.payments;
    this.movements = snapshot.movements;
    this.cashSessions = snapshot.cashSessions;
    this.nextId = snapshot.nextId;
    this.productLocks.clear();
  }
}

class AbortCheckoutError extends Error {
  constructor() {
    super("checkout_aborted");
  }
}
