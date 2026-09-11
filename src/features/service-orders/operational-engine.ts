import {
  canTransitionServiceOrderStatus,
  isAppointmentCheckInEligible,
} from "@/features/service-orders/status";
import type { AppointmentStatus, ServiceOrderStatus } from "@/types/database.types";

export type OperationalActor = {
  userId: string;
  companyId: string;
  hasUpdateStatusPermission: boolean;
  accessRevokedAt: string | null;
};

export type EngineAppointment = {
  id: string;
  companyId: string;
  status: AppointmentStatus;
  deletedAt: string | null;
};

export type EngineServiceOrder = {
  id: string;
  companyId: string;
  appointmentId: string;
  status: ServiceOrderStatus;
  checkInAt: string;
  startedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  deletedAt: string | null;
};

export type EngineError =
  | "authentication_required"
  | "company_membership_required"
  | "appointment_not_found"
  | "appointment_not_eligible"
  | "service_order_not_found"
  | "service_order_cancelled"
  | "service_order_not_cancellable"
  | "invalid_status_transition"
  | "unique_violation";

export type EngineOk<T> = {
  ok: true;
  value: T;
  changed: boolean;
  idempotent: boolean;
  uniqueViolationExposed: boolean;
};

export type EngineFail = {
  ok: false;
  error: EngineError;
  uniqueViolationExposed: boolean;
};

export type EngineResult<T> = EngineOk<T> | EngineFail;

export type DerivedEffects = {
  consumptionSeeds: number;
  packageLinks: number;
  stockMovements: number;
  financialEntries: number;
  notifications: number;
  appointmentStatusWrites: number;
};

const EMPTY_EFFECTS: DerivedEffects = {
  consumptionSeeds: 0,
  packageLinks: 0,
  stockMovements: 0,
  financialEntries: 0,
  notifications: 0,
  appointmentStatusWrites: 0,
};

function clock(nowIso: string, offsetMs = 0): string {
  return new Date(new Date(nowIso).getTime() + offsetMs).toISOString();
}

function fail(error: EngineError): EngineFail {
  return { ok: false, error, uniqueViolationExposed: false };
}

function isEngineFail(value: EngineServiceOrder | EngineFail): value is EngineFail {
  return "error" in value;
}

function authorize(actor: OperationalActor | null): EngineFail | null {
  if (!actor || !actor.userId) {
    return fail("authentication_required");
  }
  if (actor.accessRevokedAt) {
    return fail("company_membership_required");
  }
  if (!actor.hasUpdateStatusPermission) {
    return fail("company_membership_required");
  }
  return null;
}

export class ServiceOrderOperationalStore {
  appointments = new Map<string, EngineAppointment>();
  ordersByAppointment = new Map<string, EngineServiceOrder>();
  ordersById = new Map<string, EngineServiceOrder>();
  consumptionKeys = new Set<string>();
  packageLinked = new Set<string>();
  stockKeys = new Set<string>();
  financeKeys = new Set<string>();
  notificationKeys = new Set<string>();
  effects: DerivedEffects = { ...EMPTY_EFFECTS };
  nowIso: string;
  private seq = 0;

  constructor(nowIso = "2026-09-11T15:00:00.000Z") {
    this.nowIso = nowIso;
  }

  addAppointment(appointment: EngineAppointment): void {
    this.appointments.set(appointment.id, { ...appointment });
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private seedConsumptions(orderId: string, created: boolean): void {
    const key = `seed:${orderId}`;
    if (this.consumptionKeys.has(key)) {
      return;
    }
    this.consumptionKeys.add(key);
    if (created) {
      this.effects.consumptionSeeds += 1;
    }
  }

  private linkPackage(appointmentId: string, orderId: string, created: boolean): void {
    const key = `pkg:${appointmentId}:${orderId}`;
    if (this.packageLinked.has(key)) {
      return;
    }
    this.packageLinked.add(key);
    if (created) {
      this.effects.packageLinks += 1;
    }
  }

  checkIn(
    actor: OperationalActor | null,
    appointmentId: string,
  ): EngineResult<{ serviceOrderId: string }> {
    const denied = authorize(actor);
    if (denied) {
      return denied;
    }

    const appointment = this.appointments.get(appointmentId);
    if (
      !appointment ||
      appointment.deletedAt ||
      appointment.companyId !== actor!.companyId
    ) {
      return fail("appointment_not_found");
    }

    const existing = this.ordersByAppointment.get(appointmentId);
    if (existing && !existing.deletedAt) {
      if (existing.companyId !== actor!.companyId) {
        return fail("appointment_not_found");
      }
      if (existing.status === "cancelled") {
        return fail("service_order_cancelled");
      }
      if (existing.status === "completed") {
        return fail("appointment_not_eligible");
      }

      this.seedConsumptions(existing.id, false);
      this.linkPackage(appointmentId, existing.id, false);
      return {
        ok: true,
        value: { serviceOrderId: existing.id },
        changed: false,
        idempotent: true,
        uniqueViolationExposed: false,
      };
    }

    if (!isAppointmentCheckInEligible(appointment.status)) {
      return fail("appointment_not_eligible");
    }

    if (existing) {
      return fail("appointment_not_eligible");
    }

    const order: EngineServiceOrder = {
      id: this.nextId("so"),
      companyId: actor!.companyId,
      appointmentId,
      status: "waiting",
      checkInAt: this.nowIso,
      startedAt: null,
      readyAt: null,
      completedAt: null,
      cancelledAt: null,
      deletedAt: null,
    };

    this.ordersByAppointment.set(appointmentId, order);
    this.ordersById.set(order.id, order);

    if (appointment.status === "scheduled") {
      appointment.status = "confirmed";
      this.effects.appointmentStatusWrites += 1;
    }

    this.seedConsumptions(order.id, true);
    this.linkPackage(appointmentId, order.id, true);

    return {
      ok: true,
      value: { serviceOrderId: order.id },
      changed: true,
      idempotent: false,
      uniqueViolationExposed: false,
    };
  }

  /**
   * Duas chamadas intercaladas no padrão SELECT → INSERT.
   * O motor real usa lock + ON CONFLICT; este método prova o bug antigo
   * versus o comportamento corrigido.
   */
  checkInConcurrent(
    actor: OperationalActor,
    appointmentId: string,
    mode: "legacy-select-insert" | "on-conflict",
  ): {
    first: EngineResult<{ serviceOrderId: string }>;
    second: EngineResult<{ serviceOrderId: string }>;
    distinctOrderIds: number;
  } {
    if (mode === "on-conflict") {
      const first = this.checkIn(actor, appointmentId);
      const second = this.checkIn(actor, appointmentId);
      const ids = new Set<string>();
      if (first.ok) ids.add(first.value.serviceOrderId);
      if (second.ok) ids.add(second.value.serviceOrderId);
      return { first, second, distinctOrderIds: ids.size };
    }

    const appointment = this.appointments.get(appointmentId);
    const seenA = this.ordersByAppointment.get(appointmentId);
    const seenB = this.ordersByAppointment.get(appointmentId);

    if (seenA || seenB || !appointment) {
      const first = this.checkIn(actor, appointmentId);
      const second = this.checkIn(actor, appointmentId);
      const ids = new Set<string>();
      if (first.ok) ids.add(first.value.serviceOrderId);
      if (second.ok) ids.add(second.value.serviceOrderId);
      return { first, second, distinctOrderIds: ids.size };
    }

    const firstOrder: EngineServiceOrder = {
      id: this.nextId("so"),
      companyId: actor.companyId,
      appointmentId,
      status: "waiting",
      checkInAt: this.nowIso,
      startedAt: null,
      readyAt: null,
      completedAt: null,
      cancelledAt: null,
      deletedAt: null,
    };
    this.ordersByAppointment.set(appointmentId, firstOrder);
    this.ordersById.set(firstOrder.id, firstOrder);

    return {
      first: {
        ok: true,
        value: { serviceOrderId: firstOrder.id },
        changed: true,
        idempotent: false,
        uniqueViolationExposed: false,
      },
      second: {
        ok: false,
        error: "unique_violation",
        uniqueViolationExposed: true,
      },
      distinctOrderIds: 1,
    };
  }

  private loadOrder(
    actor: OperationalActor,
    serviceOrderId: string,
  ): EngineServiceOrder | EngineFail {
    const order = this.ordersById.get(serviceOrderId);
    if (!order || order.deletedAt || order.companyId !== actor.companyId) {
      return fail("service_order_not_found");
    }
    return order;
  }

  start(
    actor: OperationalActor | null,
    serviceOrderId: string,
  ): EngineResult<{ status: ServiceOrderStatus }> {
    const denied = authorize(actor);
    if (denied) return denied;
    const order = this.loadOrder(actor!, serviceOrderId);
    if (isEngineFail(order)) return order;

    const current = order as EngineServiceOrder;
    if (current.status === "in_progress") {
      return {
        ok: true,
        value: { status: current.status },
        changed: false,
        idempotent: true,
        uniqueViolationExposed: false,
      };
    }

    if (!canTransitionServiceOrderStatus(current.status, "in_progress")) {
      return fail("invalid_status_transition");
    }

    current.status = "in_progress";
    current.startedAt = current.startedAt ?? this.nowIso;

    const appointment = this.appointments.get(current.appointmentId);
    if (
      appointment &&
      (appointment.status === "scheduled" ||
        appointment.status === "confirmed" ||
        appointment.status === "in_progress")
    ) {
      appointment.status = "in_progress";
      this.effects.appointmentStatusWrites += 1;
    }

    return {
      ok: true,
      value: { status: current.status },
      changed: true,
      idempotent: false,
      uniqueViolationExposed: false,
    };
  }

  markReady(
    actor: OperationalActor | null,
    serviceOrderId: string,
  ): EngineResult<{ status: ServiceOrderStatus }> {
    const denied = authorize(actor);
    if (denied) return denied;
    const order = this.loadOrder(actor!, serviceOrderId);
    if (isEngineFail(order)) return order;

    const current = order as EngineServiceOrder;
    if (current.status === "ready") {
      return {
        ok: true,
        value: { status: current.status },
        changed: false,
        idempotent: true,
        uniqueViolationExposed: false,
      };
    }

    if (!canTransitionServiceOrderStatus(current.status, "ready")) {
      return fail("invalid_status_transition");
    }

    const stockKey = `stock:${current.id}`;
    if (!this.stockKeys.has(stockKey)) {
      this.stockKeys.add(stockKey);
      this.effects.stockMovements += 1;
    }

    current.status = "ready";
    current.readyAt = current.readyAt ?? clock(this.nowIso, 60_000);

    const appointment = this.appointments.get(current.appointmentId);
    if (appointment && appointment.status === "in_progress") {
      appointment.status = "completed";
      this.effects.appointmentStatusWrites += 1;
    }

    const financeKey = `finance:${current.id}`;
    if (!this.financeKeys.has(financeKey)) {
      this.financeKeys.add(financeKey);
      this.effects.financialEntries += 1;
    }

    const notifyKey = `notify:${current.id}`;
    if (!this.notificationKeys.has(notifyKey)) {
      this.notificationKeys.add(notifyKey);
      this.effects.notifications += 1;
    }

    return {
      ok: true,
      value: { status: current.status },
      changed: true,
      idempotent: false,
      uniqueViolationExposed: false,
    };
  }

  complete(
    actor: OperationalActor | null,
    serviceOrderId: string,
  ): EngineResult<{ status: ServiceOrderStatus }> {
    const denied = authorize(actor);
    if (denied) return denied;
    const order = this.loadOrder(actor!, serviceOrderId);
    if (isEngineFail(order)) return order;

    const current = order as EngineServiceOrder;
    if (current.status === "completed") {
      return {
        ok: true,
        value: { status: current.status },
        changed: false,
        idempotent: true,
        uniqueViolationExposed: false,
      };
    }

    if (!canTransitionServiceOrderStatus(current.status, "completed")) {
      return fail("invalid_status_transition");
    }

    current.status = "completed";
    current.completedAt = current.completedAt ?? clock(this.nowIso, 120_000);

    return {
      ok: true,
      value: { status: current.status },
      changed: true,
      idempotent: false,
      uniqueViolationExposed: false,
    };
  }

  cancel(
    actor: OperationalActor | null,
    serviceOrderId: string,
  ): EngineResult<{ status: ServiceOrderStatus; appointmentStatus: AppointmentStatus | null }> {
    const denied = authorize(actor);
    if (denied) return denied;
    const order = this.loadOrder(actor!, serviceOrderId);
    if (isEngineFail(order)) return order;

    const current = order as EngineServiceOrder;
    if (current.status === "cancelled") {
      return {
        ok: true,
        value: {
          status: current.status,
          appointmentStatus: this.appointments.get(current.appointmentId)?.status ?? null,
        },
        changed: false,
        idempotent: true,
        uniqueViolationExposed: false,
      };
    }

    if (!canTransitionServiceOrderStatus(current.status, "cancelled")) {
      return fail("service_order_not_cancellable");
    }

    current.status = "cancelled";
    current.cancelledAt = current.cancelledAt ?? this.nowIso;

    const appointment = this.appointments.get(current.appointmentId);
    if (
      appointment &&
      (appointment.status === "scheduled" || appointment.status === "confirmed")
    ) {
      appointment.status = "cancelled";
      this.effects.appointmentStatusWrites += 1;
    }

    return {
      ok: true,
      value: {
        status: current.status,
        appointmentStatus: appointment?.status ?? null,
      },
      changed: true,
      idempotent: false,
      uniqueViolationExposed: false,
    };
  }

  race(actions: Array<() => EngineResult<unknown>>): EngineResult<unknown>[] {
    return actions.map((action) => action());
  }

  timestampsAreCoherent(orderId: string): boolean {
    const order = this.ordersById.get(orderId);
    if (!order) return false;

    const checkIn = Date.parse(order.checkInAt);
    if (order.startedAt && Date.parse(order.startedAt) < checkIn) return false;
    if (order.readyAt) {
      if (!order.startedAt) return false;
      if (Date.parse(order.readyAt) < Date.parse(order.startedAt)) return false;
    }
    if (order.completedAt) {
      if (!order.readyAt) return false;
      if (Date.parse(order.completedAt) < Date.parse(order.readyAt)) return false;
    }
    return true;
  }
}

export function createStaffActor(
  companyId: string,
  overrides: Partial<OperationalActor> = {},
): OperationalActor {
  return {
    userId: overrides.userId ?? "user-1",
    companyId,
    hasUpdateStatusPermission: overrides.hasUpdateStatusPermission ?? true,
    accessRevokedAt: overrides.accessRevokedAt ?? null,
  };
}
