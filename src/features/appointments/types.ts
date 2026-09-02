import type { AppointmentStatus, CustomerPackageStatus, PetSize } from "@/types/database.types";
import type { PetChip } from "@/features/pets/types";

export type AppointmentListItem = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: AppointmentStatus;
  service_name_snapshot: string;
  price_cents_snapshot: number;
  duration_minutes_snapshot: number;
  pet_size: PetSize | null;
  notes: string | null;
  recurrence_id: string | null;
  recurrence_index: number | null;
  customer_id: string;
  pet_id: string;
  service_id: string;
  employee_id: string;
  pet: PetChip;
  customer: { id: string; name: string; phone: string };
  employee: { id: string; name: string };
  customer_package_id: string | null;
  customer_package_name: string | null;
};

export type AppointmentDetail = AppointmentListItem & {
  customer_id: string;
  pet_id: string;
  service_id: string;
  employee_id: string;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentViewMode = "day" | "week";

export type AppointmentFormOptions = {
  customers: { id: string; name: string }[];
  petsByCustomer: Record<string, { id: string; name: string }[]>;
  services: {
    id: string;
    name: string;
    pricing_mode: "fixed" | "by_size";
    price_cents: number | null;
    duration_minutes: number;
  }[];
  employeesByService: Record<string, { id: string; name: string }[]>;
  sizePricesByService: Record<
    string,
    { size: PetSize; price_cents: number; duration_minutes: number }[]
  >;
  companyTimezone: string;
  customerPackages: AppointmentCustomerPackageOption[];
  catalogPackages: AppointmentCatalogPackageOption[];
};

export type AppointmentPackageItemOption = {
  serviceId: string;
  serviceName: string;
  remaining: number;
};

export type AppointmentCustomerPackageOption = {
  id: string;
  customerId: string;
  petId: string;
  name: string;
  startsAt: string;
  expiresAt: string;
  status: CustomerPackageStatus;
  items: AppointmentPackageItemOption[];
};

export type AppointmentCatalogPackageOption = {
  id: string;
  name: string;
  serviceIds: string[];
};
