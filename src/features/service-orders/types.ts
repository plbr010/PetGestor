import type { AppointmentStatus, ServiceOrderStatus } from "@/types/database.types";
import type { PetChip } from "@/features/pets/types";

export type ServiceOrderAppointmentSnapshot = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: AppointmentStatus;
  service_name_snapshot: string;
  price_cents_snapshot: number;
  duration_minutes_snapshot: number;
  pet: PetChip;
  customer: { id: string; name: string; phone: string };
  employee: { id: string; name: string };
};

export type ServiceOrderListItem = {
  id: string;
  appointment_id: string;
  status: ServiceOrderStatus;
  check_in_at: string;
  started_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  intake_notes: string | null;
  internal_notes: string | null;
  completion_notes: string | null;
  created_at: string;
  updated_at: string;
  appointment: ServiceOrderAppointmentSnapshot;
};

export type ServiceOrderDetail = ServiceOrderListItem;
