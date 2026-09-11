import type { PetSize } from "@/types/database.types";

export type AppointmentPreviewService = {
  pricing_mode: "fixed" | "by_size";
  price_cents: number | null;
  duration_minutes: number;
};

export type AppointmentSizePrice = {
  size: PetSize;
  price_cents: number;
  duration_minutes: number;
};

export type AppointmentPreview = {
  price: number;
  duration: number;
  coveredByPackage: boolean;
};

/**
 * Preview do formulário: preço, duração e pacote vêm da mesma fonte controlada.
 */
export function computeAppointmentPreview(input: {
  service: AppointmentPreviewService | null | undefined;
  petSize: PetSize | "";
  sizePrices: AppointmentSizePrice[] | undefined;
  customerPackageId: string;
}): AppointmentPreview | null {
  const { service, petSize, sizePrices, customerPackageId } = input;
  const coveredByPackage = customerPackageId.length > 0;

  if (!service) {
    return null;
  }

  if (service.pricing_mode === "fixed") {
    return {
      price: coveredByPackage ? 0 : (service.price_cents ?? 0),
      duration: service.duration_minutes,
      coveredByPackage,
    };
  }

  if (!petSize) {
    return null;
  }

  const sizePrice = sizePrices?.find((row) => row.size === petSize);
  if (!sizePrice) {
    return null;
  }

  return {
    price: coveredByPackage ? 0 : sizePrice.price_cents,
    duration: sizePrice.duration_minutes,
    coveredByPackage,
  };
}
