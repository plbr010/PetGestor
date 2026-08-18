"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildRpcItemsPayload,
  buildRpcPaymentsPayload,
} from "@/features/pos/cart-engine";
import { mapPosError } from "@/features/pos/utils";
import { parseCancelSaleForm, parseCompleteSaleJson } from "@/features/pos/schemas";
import type { CartLine, SalePaymentInput } from "@/features/pos/types";
import { requirePermission } from "@/lib/auth/require-permission";
import { hasPermission } from "@/lib/auth/permissions";
import { GENERIC_NOT_FOUND_MESSAGE } from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PosActionState = {
  error?: string;
  success?: string;
  saleId?: string;
};

function revalidatePos(saleId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pdv");
  revalidatePath("/dashboard/pdv/vendas");
  revalidatePath("/dashboard/financeiro");
  revalidatePath("/dashboard/estoque");
  revalidatePath("/dashboard/estoque/movimentacoes");

  if (saleId) {
    revalidatePath(`/dashboard/pdv/vendas/${saleId}`);
  }
}

export async function completeSaleAction(
  _prevState: PosActionState,
  formData: FormData,
): Promise<PosActionState> {
  const context = await requirePermission("pos.use");
  const payloadRaw = formData.get("payload");

  if (typeof payloadRaw !== "string") {
    return { error: "Dados inválidos." };
  }

  const parsed = parseCompleteSaleJson(payloadRaw);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const hasDiscount =
    parsed.data.discountType !== null &&
    ((parsed.data.discountFixedCents ?? 0) > 0 || (parsed.data.discountPercent ?? 0) > 0);

  if (hasDiscount && !hasPermission(context.membership, "pos.apply_discount")) {
    return { error: "Você não tem permissão para aplicar desconto." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("complete_product_sale", {
    p_idempotency_key: parsed.data.idempotencyKey,
    p_items: buildRpcItemsPayload(
      parsed.data.items.map((item) => ({
        productId: item.productId,
        name: "",
        unit: "unit",
        unitPriceCents: item.unitPriceCents,
        costPriceCents: 0,
        quantity: item.quantity,
        availableStock: 0,
        trackStock: true,
      })) satisfies CartLine[],
    ),
    p_payments: buildRpcPaymentsPayload(parsed.data.payments satisfies SalePaymentInput[]),
    p_customer_id: parsed.data.customerId,
    p_discount_type: parsed.data.discountType,
    p_discount_fixed_cents: parsed.data.discountFixedCents,
    p_discount_percent: parsed.data.discountPercent,
    p_cash_received_cents: parsed.data.cashReceivedCents,
  });

  if (error || !data) {
    return { error: mapPosError(error?.message) };
  }

  revalidatePos(data);
  redirect(`/dashboard/pdv/vendas/${data}?concluida=1`);
}

export async function cancelSaleAction(
  saleId: string,
  _prevState: PosActionState,
  formData: FormData,
): Promise<PosActionState> {
  if (!isValidUuid(saleId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await requirePermission("pos.cancel_sale");
  const parsed = parseCancelSaleForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_product_sale", {
    p_sale_id: saleId,
    p_reason: parsed.data.reason,
  });

  if (error || !data) {
    return { error: mapPosError(error?.message) };
  }

  revalidatePos(saleId);
  return { success: "Venda cancelada com sucesso." };
}
