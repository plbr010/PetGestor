import { addDaysToDateString, getTodayInTimezone } from "@/lib/timezone";

import type { CustomerPackageStatus } from "@/features/service-packages/types";

export const CUSTOMER_PACKAGE_STATUS_LABELS: Record<CustomerPackageStatus, string> = {
  active: "Ativo",
  expired: "Expirado",
  fully_used: "Utilizado",
  cancelled: "Cancelado",
};

export function computePackageExpiresAt(startsAt: string, validityDays: number): string {
  return addDaysToDateString(startsAt, validityDays - 1);
}

export function sumPackageQuantities(
  items: Array<{ quantity_total: number; quantity_used: number }>,
): { total: number; used: number; remaining: number } {
  const total = items.reduce((sum, item) => sum + item.quantity_total, 0);
  const used = items.reduce((sum, item) => sum + item.quantity_used, 0);

  return {
    total,
    used,
    remaining: Math.max(total - used, 0),
  };
}

export function resolveDisplayStatus(
  status: CustomerPackageStatus,
  expiresAt: string,
  remaining: number,
  timeZone: string,
): CustomerPackageStatus {
  if (status === "cancelled") {
    return "cancelled";
  }

  if (remaining <= 0) {
    return "fully_used";
  }

  const today = getTodayInTimezone(timeZone);

  if (expiresAt < today) {
    return "expired";
  }

  return status === "active" ? "active" : status;
}

export function canConsumePackage(params: {
  status: CustomerPackageStatus;
  expiresAt: string;
  remainingForService: number;
  timeZone: string;
}): boolean {
  const displayStatus = resolveDisplayStatus(
    params.status,
    params.expiresAt,
    params.remainingForService,
    params.timeZone,
  );

  return displayStatus === "active" && params.remainingForService > 0;
}

export function packageItemsToRpcPayload(
  items: Array<{ serviceId: string; quantity: number }>,
): Array<{ service_id: string; quantity: number }> {
  return items.map((item) => ({
    service_id: item.serviceId,
    quantity: item.quantity,
  }));
}

export function mapPackageError(message?: string | null): string {
  if (!message) {
    return "Não foi possível concluir a operação. Tente novamente.";
  }

  const map: Record<string, string> = {
    package_not_found: "Pacote não encontrado.",
    customer_package_not_found: "Pacote do cliente não encontrado.",
    package_not_active: "Este pacote não está ativo.",
    package_expired: "Este pacote está expirado.",
    package_balance_unavailable: "Não há saldo disponível para este serviço.",
    package_already_consumed: "Este atendimento já utilizou um pacote.",
    appointment_already_covered: "Este atendimento já está coberto por pacote.",
    package_pet_mismatch: "Este pacote não pertence a este pet.",
    package_has_usages: "Não é possível cancelar um pacote com consumos registrados.",
    usage_not_found: "Nenhum consumo de pacote encontrado para estornar.",
    invalid_package_items: "Informe ao menos um serviço no pacote.",
    duplicate_service_in_package: "Serviço duplicado no pacote.",
    service_not_found: "Serviço não encontrado.",
    pet_not_found: "Pet não encontrado.",
  };

  for (const [code, text] of Object.entries(map)) {
    if (message.includes(code)) {
      return text;
    }
  }

  return "Não foi possível concluir a operação. Tente novamente.";
}
