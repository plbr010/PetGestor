"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { notifyProductStockStatus } from "@/features/app-notifications/emitters";
import {
  parseCategoryForm,
  parseProductForm,
  parseStockAdjustmentForm,
  parseStockEntryForm,
  parseStockExitForm,
  parseSupplierForm,
} from "@/features/inventory/schemas";
import { mapStockRpcError } from "@/features/inventory/utils";
import { movementTypeFromExitReason } from "@/features/inventory/units";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  didMutateAccessibleRow,
  GENERIC_NOT_FOUND_MESSAGE,
} from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InventoryActionState = {
  error?: string;
  success?: string;
};

function revalidateInventory(productId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/estoque");
  revalidatePath("/dashboard/estoque/movimentacoes");
  revalidatePath("/dashboard/estoque/fornecedores");
  revalidatePath("/dashboard/estoque/categorias");

  if (productId) {
    revalidatePath(`/dashboard/estoque/${productId}`);
  }
}

async function requireUserId(): Promise<string | InventoryActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  return user.id;
}

export async function createProductAction(
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = parseProductForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const userId = await requireUserId();
  if (typeof userId !== "string") {
    return userId;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      company_id: context.membership.company.id,
      name: parsed.data.name,
      sku: parsed.data.sku,
      barcode: parsed.data.barcode,
      category_id: parsed.data.categoryId,
      description: parsed.data.description,
      unit: parsed.data.unit,
      cost_price_cents: parsed.data.costPriceCents,
      sale_price_cents: parsed.data.salePriceCents,
      current_stock: 0,
      minimum_stock: parsed.data.minimumStock,
      active: parsed.data.active,
      track_stock: parsed.data.trackStock,
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Já existe um produto com este SKU ou código de barras." };
    }

    return { error: "Não foi possível cadastrar o produto. Tente novamente." };
  }

  revalidateInventory(data.id);
  redirect(`/dashboard/estoque/${data.id}`);
}

export async function updateProductAction(
  productId: string,
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  if (!isValidUuid(productId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("inventory.manage");
  const parsed = parseProductForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const mutation = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      sku: parsed.data.sku,
      barcode: parsed.data.barcode,
      category_id: parsed.data.categoryId,
      description: parsed.data.description,
      unit: parsed.data.unit,
      sale_price_cents: parsed.data.salePriceCents,
      minimum_stock: parsed.data.minimumStock,
      active: parsed.data.active,
      track_stock: parsed.data.trackStock,
    })
    .eq("id", productId)
    .eq("company_id", context.membership.company.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    if (mutation.error?.code === "23505") {
      return { error: "Já existe um produto com este SKU ou código de barras." };
    }

    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateInventory(productId);
  redirect(`/dashboard/estoque/${productId}?atualizado=1`);
}

export async function archiveProductAction(productId: string): Promise<InventoryActionState> {
  if (!isValidUuid(productId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("inventory.manage");
  const supabase = await createSupabaseServerClient();
  const mutation = await supabase
    .from("products")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("id", productId)
    .eq("company_id", context.membership.company.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateInventory();
  redirect("/dashboard/estoque?arquivado=1");
}

export async function createCategoryAction(
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = parseCategoryForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const userId = await requireUserId();
  if (typeof userId !== "string") {
    return userId;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("product_categories").insert({
    company_id: context.membership.company.id,
    name: parsed.data.name,
    created_by: userId,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma categoria com este nome." };
    }

    return { error: "Não foi possível criar a categoria." };
  }

  revalidateInventory();
  return { success: "Categoria criada." };
}

export async function updateCategoryAction(
  categoryId: string,
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  if (!isValidUuid(categoryId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("inventory.manage");
  const parsed = parseCategoryForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const mutation = await supabase
    .from("product_categories")
    .update({ name: parsed.data.name })
    .eq("id", categoryId)
    .eq("company_id", context.membership.company.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    if (mutation.error?.code === "23505") {
      return { error: "Já existe uma categoria com este nome." };
    }

    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateInventory();
  return { success: "Categoria atualizada." };
}

export async function archiveCategoryAction(categoryId: string): Promise<InventoryActionState> {
  if (!isValidUuid(categoryId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("inventory.manage");
  const supabase = await createSupabaseServerClient();
  const mutation = await supabase
    .from("product_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", categoryId)
    .eq("company_id", context.membership.company.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateInventory();
  return { success: "Categoria arquivada." };
}

export async function createSupplierAction(
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = parseSupplierForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const userId = await requireUserId();
  if (typeof userId !== "string") {
    return userId;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_suppliers")
    .insert({
      company_id: context.membership.company.id,
      name: parsed.data.name,
      contact_name: parsed.data.contactName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      document: parsed.data.document,
      notes: parsed.data.notes,
      active: parsed.data.active,
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Não foi possível cadastrar o fornecedor. Tente novamente." };
  }

  revalidateInventory();
  redirect(`/dashboard/estoque/fornecedores/${data.id}`);
}

export async function updateSupplierAction(
  supplierId: string,
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  if (!isValidUuid(supplierId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("inventory.manage");
  const parsed = parseSupplierForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const mutation = await supabase
    .from("inventory_suppliers")
    .update({
      name: parsed.data.name,
      contact_name: parsed.data.contactName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      document: parsed.data.document,
      notes: parsed.data.notes,
      active: parsed.data.active,
    })
    .eq("id", supplierId)
    .eq("company_id", context.membership.company.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateInventory();
  redirect(`/dashboard/estoque/fornecedores/${supplierId}?atualizado=1`);
}

export async function archiveSupplierAction(supplierId: string): Promise<InventoryActionState> {
  if (!isValidUuid(supplierId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("inventory.manage");
  const supabase = await createSupabaseServerClient();
  const mutation = await supabase
    .from("inventory_suppliers")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("id", supplierId)
    .eq("company_id", context.membership.company.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (!didMutateAccessibleRow(mutation)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  revalidateInventory();
  redirect("/dashboard/estoque/fornecedores?arquivado=1");
}

export async function registerStockEntryAction(
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = parseStockEntryForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("register_stock_movement", {
    p_product_id: parsed.data.productId,
    p_type: "entry",
    p_quantity: parsed.data.quantity,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_unit_cost_cents: parsed.data.unitCostCents,
    p_notes: parsed.data.notes,
    p_supplier_id: parsed.data.supplierId,
    p_batch_code: parsed.data.batchCode,
    p_expiration_date: parsed.data.expirationDate,
  });

  if (error) {
    return { error: mapStockRpcError(error.message) };
  }

  await notifyProductStockStatus(
    supabase,
    context.membership.company.id,
    parsed.data.productId,
  );

  revalidateInventory(parsed.data.productId);
  redirect(`/dashboard/estoque/${parsed.data.productId}?entrada=1`);
}

export async function registerStockExitAction(
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const context = await requirePermission("inventory.manage");
  const parsed = parseStockExitForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("register_stock_movement", {
    p_product_id: parsed.data.productId,
    p_type: movementTypeFromExitReason(parsed.data.reason),
    p_quantity: parsed.data.quantity,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_reason: parsed.data.reason,
    p_notes: parsed.data.notes,
  });

  if (error) {
    return { error: mapStockRpcError(error.message) };
  }

  await notifyProductStockStatus(
    supabase,
    context.membership.company.id,
    parsed.data.productId,
  );

  revalidateInventory(parsed.data.productId);
  redirect(`/dashboard/estoque/${parsed.data.productId}?saida=1`);
}

export async function registerStockAdjustmentAction(
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const context = await requirePermission("inventory.adjust");
  const parsed = parseStockAdjustmentForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("register_stock_movement", {
    p_product_id: parsed.data.productId,
    p_type: "adjustment",
    p_quantity: 0,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_reason: "adjustment",
    p_notes: parsed.data.notes,
    p_counted_stock: parsed.data.countedStock,
  });

  if (error) {
    return { error: mapStockRpcError(error.message) };
  }

  await notifyProductStockStatus(
    supabase,
    context.membership.company.id,
    parsed.data.productId,
  );

  revalidateInventory(parsed.data.productId);
  redirect(`/dashboard/estoque/${parsed.data.productId}?ajuste=1`);
}
