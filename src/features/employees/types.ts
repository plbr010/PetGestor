export type EmployeeStatusFilter = "all" | "active" | "inactive";
export type EmployeeSchedulableFilter = "all" | "yes" | "no";

export type EmployeeServiceLink = {
  serviceId: string;
  serviceName: string;
};

export type EmployeeWorkingHourRow = {
  id: string;
  weekday: number;
  enabled: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type EmployeeListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  job_title: string | null;
  active: boolean;
  can_be_scheduled: boolean;
  created_at: string;
  services: EmployeeServiceLink[];
};

export type EmployeeDetail = EmployeeListItem & {
  notes: string | null;
  updated_at: string;
  deleted_at: string | null;
  workingHours: EmployeeWorkingHourRow[];
};

export type WorkingHourInput = {
  weekday: number;
  enabled: boolean;
  startTime: string | null;
  endTime: string | null;
};
