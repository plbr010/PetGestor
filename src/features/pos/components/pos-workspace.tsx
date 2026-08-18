"use client";

import { useActionState, useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";

import { PAYMENT_METHOD_LABELS } from "@/features/finance/status";
import { formatQuantity } from "@/features/inventory/stock-engine";
import { PRODUCT_UNIT_SHORT_LABELS } from "@/features/inventory/units";
import { completeSaleAction, type PosActionState } from "@/features/pos/actions";
import {
  computeCartSubtotalCents,
  computeCartTotalCents,
  computeChangeCents,
  computeDiscountCents,
  computeEffectivePaidCents,
  validateCartQuantity,
  validatePayments,
} from "@/features/pos/cart-engine";
import {
  parseDiscountPercentInput,
  parsePaymentAmountInput,
  parseSaleQuantityInput,
} from "@/features/pos/schemas";
import type { CartLine, PosProductItem } from "@/features/pos/types";
import { formatCentsToBRL } from "@/lib/money";
import type { CustomerOption } from "@/features/customers/types";
import type { PaymentMethod } from "@/types/database.types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StockStatusBadge } from "@/features/inventory/components/stock-status-badge";

const initialState: PosActionState = {};
const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

type PosWorkspaceProps = {
  products: PosProductItem[];
  categories: Array<{ id: string; name: string }>;
  customers: CustomerOption[];
};

export function PosWorkspace({ products, categories, customers }: PosWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [step, setStep] = useState<"cart" | "checkout">("cart");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discountType, setDiscountType] = useState<"" | "fixed" | "percent">("");
  const [discountValue, setDiscountValue] = useState("");
  const [payments, setPayments] = useState<
    { amount: string; method: PaymentMethod; key: string }[]
  >([{ amount: "", method: "pix", key: crypto.randomUUID() }]);
  const [cashReceived, setCashReceived] = useState("");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, isPending] = useActionState(completeSaleAction, initialState);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        product.name.toLowerCase().includes(term) ||
        product.sku?.toLowerCase().includes(term) ||
        product.barcode?.toLowerCase().includes(term)
      );
    });
  }, [products, search, categoryId]);

  const subtotalCents = computeCartSubtotalCents(cart);
  const discountCents = computeDiscountCents(subtotalCents, {
    type: discountType || null,
    fixedCents:
      discountType === "fixed" ? (parsePaymentAmountInput(discountValue) ?? 0) : 0,
    percent: discountType === "percent" ? parseDiscountPercentInput(discountValue) : null,
  });
  const totalCents = computeCartTotalCents(subtotalCents, discountCents);

  const paymentInputs = payments
    .map((payment) => ({
      amountCents: parsePaymentAmountInput(payment.amount) ?? 0,
      paymentMethod: payment.method,
      idempotencyKey: payment.key,
    }))
    .filter((payment) => payment.amountCents > 0);

  const changeCents = computeChangeCents(
    totalCents,
    paymentInputs,
    parsePaymentAmountInput(cashReceived),
  );
  const paidCents = computeEffectivePaidCents(
    totalCents,
    paymentInputs,
    parsePaymentAmountInput(cashReceived),
  );
  const balanceCents = Math.max(0, totalCents - paidCents);

  function addProduct(product: PosProductItem) {
    const draftQty = quantityDrafts[product.id];
    const quantity = parseSaleQuantityInput(draftQty ?? "1") ?? 1;

    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      const unitPriceCents = product.salePriceCents ?? 0;

      if (existing) {
        const nextQty = existing.quantity + quantity;
        const error = validateCartQuantity(existing, nextQty);
        if (error) return current;

        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: nextQty } : line,
        );
      }

      const line: CartLine = {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        unitPriceCents,
        costPriceCents: product.costPriceCents,
        quantity,
        availableStock: product.availableStock,
        trackStock: product.trackStock,
      };

      const error = validateCartQuantity(line, quantity);
      if (error) return current;

      return [...current, line];
    });

    setCartOpen(true);
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          const nextQty = line.quantity + delta;
          const error = validateCartQuantity(line, nextQty);
          if (error || nextQty <= 0) return line;
          return { ...line, quantity: nextQty };
        })
        .filter((line) => line.quantity > 0),
    );
  }

  function removeLine(productId: string) {
    setCart((current) => current.filter((line) => line.productId !== productId));
  }

  function buildPayload() {
    return JSON.stringify({
      idempotencyKey,
      customerId: customerId || null,
      discountType: discountType || null,
      discountFixedCents: discountType === "fixed" ? discountCents : 0,
      discountPercent:
        discountType === "percent" ? parseDiscountPercentInput(discountValue) : null,
      cashReceivedCents:
        payments.some((p) => p.method === "cash") && cashReceived
          ? parsePaymentAmountInput(cashReceived)
          : null,
      items: cart.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
      payments: paymentInputs,
    });
  }

  const checkoutError =
    cart.length === 0
      ? "Adicione produtos ao carrinho."
      : validatePayments(totalCents, paymentInputs, parsePaymentAmountInput(cashReceived));

  return (
    <>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, SKU ou código de barras"
              className="min-h-11 pl-9"
              inputMode="search"
            />
          </div>
          <Select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="min-h-11"
          >
            <option value="">Todas categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => {
            const unit = PRODUCT_UNIT_SHORT_LABELS[product.unit];
            const canSell =
              !product.trackStock ||
              product.availableStock > 0 ||
              product.stockStatus !== "out";

            return (
              <button
                key={product.id}
                type="button"
                disabled={!canSell || product.salePriceCents == null}
                onClick={() => addProduct(product)}
                className="rounded-xl border bg-card p-4 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {product.categoryName ?? "Sem categoria"}
                    </p>
                  </div>
                  <StockStatusBadge status={product.stockStatus} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">
                      {product.salePriceCents != null
                        ? formatCentsToBRL(product.salePriceCents)
                        : "—"}
                    </p>
                    {product.trackStock ? (
                      <p className="text-xs text-muted-foreground">
                        Disp.: {formatQuantity(product.availableStock, unit)}
                      </p>
                    ) : null}
                  </div>
                  <Input
                    value={quantityDrafts[product.id] ?? "1"}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      setQuantityDrafts((current) => ({
                        ...current,
                        [product.id]: event.target.value,
                      }))
                    }
                    inputMode="decimal"
                    className="h-10 w-24"
                    aria-label={`Quantidade de ${product.name}`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {filteredProducts.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-4 backdrop-blur md:hidden">
        <Button
          type="button"
          className="min-h-12 w-full"
          onClick={() => {
            setStep("cart");
            setCartOpen(true);
          }}
        >
          <ShoppingCart className="size-4" />
          Carrinho ({cart.length}) · {formatCentsToBRL(totalCents)}
        </Button>
      </div>

      <div className="hidden md:block">
        <Button
          type="button"
          className="fixed right-6 bottom-6 z-40 min-h-12 shadow-lg"
          onClick={() => {
            setStep("cart");
            setCartOpen(true);
          }}
        >
          <ShoppingCart className="size-4" />
          Carrinho ({cart.length})
        </Button>
      </div>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{step === "cart" ? "Carrinho" : "Pagamento"}</SheetTitle>
          </SheetHeader>

          {state.error ? <FormFeedback message={state.error} variant="error" /> : null}

          {step === "cart" ? (
            <div className="space-y-4 px-4">
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground">Carrinho vazio.</p>
              ) : (
                <ul className="space-y-3">
                  {cart.map((line) => (
                    <li key={line.productId} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{line.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatCentsToBRL(line.unitPriceCents)} /{" "}
                            {PRODUCT_UNIT_SHORT_LABELS[line.unit]}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeLine(line.productId)}
                          aria-label={`Remover ${line.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => updateQuantity(line.productId, -1)}
                          >
                            <Minus className="size-4" />
                          </Button>
                          <span className="min-w-16 text-center font-medium">
                            {formatQuantity(line.quantity)}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => updateQuantity(line.productId, 1)}
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                        <p className="font-semibold">
                          {formatCentsToBRL(Math.round(line.quantity * line.unitPriceCents))}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatCentsToBRL(subtotalCents)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <form action={formAction} className="space-y-4 px-4">
              <input type="hidden" name="payload" value={buildPayload()} readOnly />

              <div className="space-y-2">
                <Label htmlFor="pos-customer">Cliente (opcional)</Label>
                <Select
                  id="pos-customer"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">Consumidor não identificado</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pos-discount-type">Desconto</Label>
                  <Select
                    id="pos-discount-type"
                    value={discountType}
                    onChange={(event) =>
                      setDiscountType(event.target.value as "" | "fixed" | "percent")
                    }
                  >
                    <option value="">Sem desconto</option>
                    <option value="fixed">Valor fixo</option>
                    <option value="percent">Percentual</option>
                  </Select>
                </div>
                {discountType ? (
                  <div className="space-y-2">
                    <Label htmlFor="pos-discount-value">
                      {discountType === "fixed" ? "Valor do desconto" : "Percentual (%)"}
                    </Label>
                    <Input
                      id="pos-discount-value"
                      value={discountValue}
                      onChange={(event) => setDiscountValue(event.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCentsToBRL(subtotalCents)}</span>
                </div>
                {discountCents > 0 ? (
                  <div className="flex justify-between text-destructive">
                    <span>Desconto</span>
                    <span>-{formatCentsToBRL(discountCents)}</span>
                  </div>
                ) : null}
                <div className="mt-1 flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{formatCentsToBRL(totalCents)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Pagamentos</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPayments((current) => [
                        ...current,
                        { amount: "", method: "cash", key: crypto.randomUUID() },
                      ])
                    }
                  >
                    Dividir pagamento
                  </Button>
                </div>

                {payments.map((payment, index) => (
                  <div key={payment.key} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      value={payment.amount}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, amount: event.target.value } : row,
                          ),
                        )
                      }
                      inputMode="decimal"
                      placeholder="Valor"
                    />
                    <Select
                      value={payment.method}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, method: event.target.value as PaymentMethod }
                              : row,
                          ),
                        )
                      }
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {PAYMENT_METHOD_LABELS[method]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>

              {payments.some((payment) => payment.method === "cash") ? (
                <div className="space-y-2">
                  <Label htmlFor="pos-cash-received">Valor recebido (dinheiro)</Label>
                  <Input
                    id="pos-cash-received"
                    value={cashReceived}
                    onChange={(event) => setCashReceived(event.target.value)}
                    inputMode="decimal"
                    placeholder="Para calcular troco"
                  />
                </div>
              ) : null}

              <div className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span>Pago</span>
                  <span>{formatCentsToBRL(paidCents)}</span>
                </div>
                {balanceCents > 0 ? (
                  <div className="flex justify-between text-amber-700">
                    <span>Saldo pendente</span>
                    <span>{formatCentsToBRL(balanceCents)}</span>
                  </div>
                ) : null}
                {changeCents > 0 ? (
                  <div className="flex justify-between font-medium">
                    <span>Troco</span>
                    <span>{formatCentsToBRL(changeCents)}</span>
                  </div>
                ) : null}
              </div>

              {checkoutError ? (
                <FormFeedback message={checkoutError} variant="error" />
              ) : null}

              <SheetFooter className="px-0">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setStep("cart")}
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  className="min-h-11 flex-1"
                  disabled={isPending || Boolean(checkoutError)}
                >
                  {isPending ? "Finalizando..." : "Finalizar venda"}
                </Button>
              </SheetFooter>
            </form>
          )}

          {step === "cart" ? (
            <SheetFooter>
              <Button
                type="button"
                className="min-h-11 w-full"
                disabled={cart.length === 0}
                onClick={() => setStep("checkout")}
              >
                Ir para pagamento · {formatCentsToBRL(totalCents)}
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
