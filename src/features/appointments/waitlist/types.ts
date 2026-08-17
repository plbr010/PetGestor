export const WAITLIST_PERIODS = ["morning", "afternoon", "evening", "any"] as const;

export type WaitlistPeriod = (typeof WAITLIST_PERIODS)[number];

export const WAITLIST_STATUSES = ["waiting", "contacted", "converted", "cancelled"] as const;

export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export type WaitlistListItem = {
  id: string;
  customer_id: string;
  pet_id: string;
  service_id: string;
  preferred_employee_id: string | null;
  preferred_date: string | null;
  preferred_period: WaitlistPeriod | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  notes: string | null;
  status: WaitlistStatus;
  appointment_id: string | null;
  contacted_at: string | null;
  created_at: string;
  customer: { id: string; name: string };
  pet: { id: string; name: string };
  service: { id: string; name: string };
  preferredEmployee: { id: string; name: string } | null;
};

export type CancelledSlotForWaitlist = {
  service_id: string;
  employee_id: string;
  scheduled_start: string;
  scheduled_end: string;
};

export type WaitlistMatchCandidate = Pick<
  WaitlistListItem,
  | "id"
  | "service_id"
  | "preferred_employee_id"
  | "preferred_date"
  | "preferred_period"
  | "preferred_time_start"
  | "preferred_time_end"
  | "status"
>;

export type AppointmentQuickPrefill = {
  date: string;
  time: string;
  customerId?: string;
  petId?: string;
  serviceId?: string;
  employeeId?: string;
  petSize?: string | null;
  notes?: string | null;
};
