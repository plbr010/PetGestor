import type { ServicePricingMode, PetSize } from "@/types/database.types";

export type ServiceSizePriceRow = {
  id: string;
  size: PetSize;
  price_cents: number;
  duration_minutes: number;
};

export type ServiceListItem = {
  id: string;
  name: string;
  description: string | null;
  pricing_mode: ServicePricingMode;
  price_cents: number | null;
  duration_minutes: number;
  active: boolean;
  created_at: string;
  sizePrices?: ServiceSizePriceRow[];
};

export type ServiceDetail = ServiceListItem & {
  updated_at: string;
  deleted_at: string | null;
  sizePrices: ServiceSizePriceRow[];
};

export type ServiceStatusFilter = "all" | "active" | "inactive";

export type ServiceSizePriceInput = {
  size: PetSize;
  priceCents: number;
  durationMinutes: number;
};
