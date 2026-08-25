import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAppNotification } from "@/features/app-notifications/create";
import { formatDateTimeDisplay } from "@/lib/pet-display";
import {
  addDaysToDateString,
  formatUtcDateInTimezone,
  formatUtcInTimezone,
  getTodayInTimezone,
} from "@/lib/timezone";
import type { Database } from "@/types/database.types";

type DbClient = SupabaseClient<Database>;

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Materializa alertas derivados (vencidos, estoque, pacotes, agenda próxima)
 * com dedupe — seguro chamar ao abrir o sino / página.
 */
export async function syncDerivedAppNotifications(
  supabase: DbClient,
  companyId: string,
  timeZone: string,
): Promise<void> {
  await Promise.all([
    syncOverduePayments(supabase, companyId, timeZone),
    syncLowStock(supabase, companyId),
    syncExpiringPackages(supabase, companyId, timeZone),
    syncUpcomingAppointments(supabase, companyId, timeZone),
  ]);
}

async function syncOverduePayments(
  supabase: DbClient,
  companyId: string,
  timeZone: string,
): Promise<void> {
  const today = getTodayInTimezone(timeZone);
  const { data, error } = await supabase
    .from("financial_entries")
    .select("id, description, due_date")
    .eq("company_id", companyId)
    .in("status", ["pending", "partially_paid"])
    .not("due_date", "is", null)
    .lt("due_date", today)
    .is("deleted_at", null)
    .limit(30);

  if (error || !data) {
    return;
  }

  for (const entry of data) {
    if (!entry.due_date) continue;
    await createAppNotification(supabase, {
      companyId,
      type: "payment_overdue",
      severity: "error",
      title: "Pagamento vencido",
      message: `${entry.description} venceu em ${entry.due_date}.`,
      entityType: "financial_entry",
      entityId: entry.id,
      href: `/dashboard/financeiro/${entry.id}`,
      requiredPermission: "finance.view",
      dedupeKey: `broadcast:payment_overdue:${entry.id}:${entry.due_date}`,
    });
  }
}

async function syncLowStock(supabase: DbClient, companyId: string): Promise<void> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, stock_status, current_stock")
    .eq("company_id", companyId)
    .in("stock_status", ["low", "out"])
    .is("archived_at", null)
    .limit(40);

  if (error || !data) {
    return;
  }

  for (const product of data) {
    const isOut = product.stock_status === "out";
    await createAppNotification(supabase, {
      companyId,
      type: isOut ? "stock_out" : "stock_low",
      severity: isOut ? "error" : "warning",
      title: isOut ? "Produto sem estoque" : "Estoque baixo",
      message: isOut
        ? `${product.name} está sem estoque.`
        : `${product.name} está com estoque baixo (${product.current_stock}).`,
      entityType: "product",
      entityId: product.id,
      href: `/dashboard/estoque/${product.id}`,
      requiredPermission: "inventory.view",
      dedupeKey: `broadcast:${isOut ? "stock_out" : "stock_low"}:${product.id}`,
    });
  }
}

async function syncExpiringPackages(
  supabase: DbClient,
  companyId: string,
  timeZone: string,
): Promise<void> {
  const today = getTodayInTimezone(timeZone);
  const limitDate = addDaysToDateString(today, 7);

  const { data, error } = await supabase
    .from("customer_service_packages")
    .select("id, expires_at, status, package_name_snapshot, pets(name)")
    .eq("company_id", companyId)
    .eq("status", "active")
    .gte("expires_at", `${today}T00:00:00`)
    .lte("expires_at", `${limitDate}T23:59:59`)
    .limit(30);

  if (error || !data) {
    return;
  }

  for (const pkg of data) {
    const pet = unwrapJoin(pkg.pets as { name: string } | { name: string }[] | null);
    const petName = pet?.name ?? "pet";
    const expiresKey = formatUtcDateInTimezone(pkg.expires_at, timeZone);

    await createAppNotification(supabase, {
      companyId,
      type: "package_expiring",
      severity: "warning",
      title: "Pacote próximo de vencer",
      message: `${pkg.package_name_snapshot} de ${petName} vence em ${expiresKey}.`,
      entityType: "customer_package",
      entityId: pkg.id,
      href: `/dashboard/servicos/pacotes`,
      requiredPermission: "services.view",
      dedupeKey: `broadcast:package_expiring:${pkg.id}:${expiresKey}`,
    });
  }
}

async function syncUpcomingAppointments(
  supabase: DbClient,
  companyId: string,
  timeZone: string,
): Promise<void> {
  const now = new Date();
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("appointments")
    .select("id, scheduled_start, employee_id, pets(name), employees(user_id, name)")
    .eq("company_id", companyId)
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_start", now.toISOString())
    .lte("scheduled_start", inTwoHours.toISOString())
    .is("deleted_at", null)
    .limit(30);

  if (error || !data) {
    return;
  }

  for (const appointment of data) {
    const pet = unwrapJoin(appointment.pets as { name: string } | { name: string }[] | null);
    const employee = unwrapJoin(
      appointment.employees as
        | { user_id: string | null; name: string }
        | { user_id: string | null; name: string }[]
        | null,
    );
    const petName = pet?.name ?? "pet";
    const dateKey = formatUtcDateInTimezone(appointment.scheduled_start, timeZone);
    const hour = formatUtcInTimezone(appointment.scheduled_start, timeZone).slice(0, 2);
    const hourKey = `${dateKey}-${hour}`;
    const when = formatDateTimeDisplay(appointment.scheduled_start);

    await createAppNotification(supabase, {
      companyId,
      type: "appointment_upcoming",
      severity: "info",
      title: "Agendamento próximo",
      message: `${petName} às ${when}.`,
      entityType: "appointment",
      entityId: appointment.id,
      href: `/dashboard/agenda/${appointment.id}`,
      requiredPermission: "appointments.view",
      dedupeKey: `broadcast:appointment_upcoming:${appointment.id}:${hourKey}`,
    });

    if (employee?.user_id) {
      await createAppNotification(supabase, {
        companyId,
        userId: employee.user_id,
        type: "appointment_upcoming",
        severity: "info",
        title: "Seu próximo atendimento",
        message: `${petName} às ${when}.`,
        entityType: "appointment",
        entityId: appointment.id,
        href: `/dashboard/agenda/${appointment.id}`,
        requiredPermission: "appointments.view",
        dedupeKey: `user:${employee.user_id}:appointment_upcoming:${appointment.id}:${hourKey}`,
      });
    }
  }
}
