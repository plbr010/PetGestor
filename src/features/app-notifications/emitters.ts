import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAppNotification } from "@/features/app-notifications/create";
import { formatDateTimeDisplay } from "@/lib/pet-display";
import type { Database } from "@/types/database.types";

type DbClient = SupabaseClient<Database>;

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function notifyServiceOrderReady(
  supabase: DbClient,
  companyId: string,
  serviceOrderId: string,
): Promise<void> {
  const { data } = await supabase
    .from("service_orders")
    .select(
      `
      id,
      appointments!service_orders_appointment_company_fkey(
        pets(name),
        employees(user_id, name)
      )
    `,
    )
    .eq("company_id", companyId)
    .eq("id", serviceOrderId)
    .maybeSingle();

  const appointment = unwrapJoin(
    data?.appointments as
      | {
          pets: { name: string } | { name: string }[] | null;
          employees:
            | { user_id: string | null; name: string }
            | { user_id: string | null; name: string }[]
            | null;
        }
      | null
      | undefined,
  );
  const pet = unwrapJoin(appointment?.pets ?? null);
  const employee = unwrapJoin(appointment?.employees ?? null);
  const petName = pet?.name ?? "Pet";

  await createAppNotification(supabase, {
    companyId,
    type: "service_order_ready",
    severity: "success",
    title: "Atendimento pronto",
    message: `${petName} está pronto para retirada.`,
    entityType: "service_order",
    entityId: serviceOrderId,
    href: `/dashboard/atendimentos/${serviceOrderId}`,
    requiredPermission: "service_orders.view",
    dedupeKey: `broadcast:service_order_ready:${serviceOrderId}`,
  });

  if (employee?.user_id) {
    await createAppNotification(supabase, {
      companyId,
      userId: employee.user_id,
      type: "service_order_ready",
      severity: "success",
      title: "Seu atendimento ficou pronto",
      message: `${petName} está pronto para retirada.`,
      entityType: "service_order",
      entityId: serviceOrderId,
      href: `/dashboard/atendimentos/${serviceOrderId}`,
      requiredPermission: "service_orders.view",
      dedupeKey: `user:${employee.user_id}:service_order_ready:${serviceOrderId}`,
    });
  }
}

export async function notifyProductStockStatus(
  supabase: DbClient,
  companyId: string,
  productId: string,
): Promise<void> {
  const { data: product } = await supabase
    .from("products")
    .select("id, name, stock_status, current_stock, track_stock, archived_at")
    .eq("company_id", companyId)
    .eq("id", productId)
    .maybeSingle();

  if (!product || product.archived_at || !product.track_stock) {
    return;
  }

  if (product.stock_status === "out") {
    await createAppNotification(supabase, {
      companyId,
      type: "stock_out",
      severity: "error",
      title: "Produto sem estoque",
      message: `${product.name} está sem estoque.`,
      entityType: "product",
      entityId: product.id,
      href: `/dashboard/estoque/${product.id}`,
      requiredPermission: "inventory.view",
      dedupeKey: `broadcast:stock_out:${product.id}`,
    });
    return;
  }

  if (product.stock_status === "low") {
    await createAppNotification(supabase, {
      companyId,
      type: "stock_low",
      severity: "warning",
      title: "Estoque baixo",
      message: `${product.name} está com estoque baixo (${product.current_stock}).`,
      entityType: "product",
      entityId: product.id,
      href: `/dashboard/estoque/${product.id}`,
      requiredPermission: "inventory.view",
      dedupeKey: `broadcast:stock_low:${product.id}`,
    });
  }
}

export async function notifyAppointmentAssigned(
  supabase: DbClient,
  companyId: string,
  appointmentId: string,
): Promise<void> {
  const { data } = await supabase
    .from("appointments")
    .select("id, scheduled_start, pets(name), employees(user_id, name)")
    .eq("company_id", companyId)
    .eq("id", appointmentId)
    .maybeSingle();

  if (!data) {
    return;
  }

  const pet = unwrapJoin(data.pets as { name: string } | { name: string }[] | null);
  const employee = unwrapJoin(
    data.employees as
      | { user_id: string | null; name: string }
      | { user_id: string | null; name: string }[]
      | null,
  );

  if (!employee?.user_id) {
    return;
  }

  const petName = pet?.name ?? "pet";
  const when = formatDateTimeDisplay(data.scheduled_start);

  await createAppNotification(supabase, {
    companyId,
    userId: employee.user_id,
    type: "appointment_assigned",
    severity: "info",
    title: "Atendimento atribuído a você",
    message: `${petName} em ${when}.`,
    entityType: "appointment",
    entityId: appointmentId,
    href: `/dashboard/agenda/${appointmentId}`,
    requiredPermission: "appointments.view",
    dedupeKey: `user:${employee.user_id}:appointment_assigned:${appointmentId}`,
  });
}

export async function notifyPaymentPending(
  supabase: DbClient,
  companyId: string,
  entryId: string,
): Promise<void> {
  const { data } = await supabase
    .from("financial_entries")
    .select("id, description, due_date, status")
    .eq("company_id", companyId)
    .eq("id", entryId)
    .maybeSingle();

  if (!data || (data.status !== "pending" && data.status !== "partially_paid")) {
    return;
  }

  const due = data.due_date ? ` Vencimento: ${data.due_date}.` : "";

  await createAppNotification(supabase, {
    companyId,
    type: "payment_pending",
    severity: "warning",
    title: "Pagamento pendente",
    message: `${data.description}.${due}`,
    entityType: "financial_entry",
    entityId: data.id,
    href: `/dashboard/financeiro/${data.id}`,
    requiredPermission: "finance.view",
    dedupeKey: `broadcast:payment_pending:${data.id}`,
  });
}

export async function notifyEmployeeInvitePending(
  supabase: DbClient,
  companyId: string,
  email: string,
  inviteId?: string | null,
): Promise<void> {
  const key = inviteId ?? email.toLowerCase();

  await createAppNotification(supabase, {
    companyId,
    type: "employee_invite_pending",
    severity: "info",
    title: "Convite de funcionário pendente",
    message: `Convite enviado para ${email}. Aguardando aceite.`,
    entityType: "employee_invite",
    entityId: inviteId ?? null,
    href: `/dashboard/funcionarios`,
    requiredPermission: "employees.manage",
    dedupeKey: `broadcast:employee_invite_pending:${key}`,
  });
}

export async function notifyIntegrationError(
  supabase: DbClient,
  companyId: string,
  title: string,
  message: string,
  dedupeKey: string,
): Promise<void> {
  await createAppNotification(supabase, {
    companyId,
    type: "integration_error",
    severity: "error",
    title,
    message,
    entityType: "integration",
    href: `/assinatura`,
    requiredPermission: "subscription.manage",
    dedupeKey: `broadcast:integration_error:${dedupeKey}`,
  });
}
