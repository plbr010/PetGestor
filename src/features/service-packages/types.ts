export const CUSTOMER_PACKAGE_STATUSES = [
  "active",
  "expired",
  "fully_used",
  "cancelled",
] as const;

export type CustomerPackageStatus = (typeof CUSTOMER_PACKAGE_STATUSES)[number];

export type ServicePackageItemInput = {
  serviceId: string;
  quantity: number;
};

export type ServicePackageListItem = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  validity_days: number;
  active: boolean;
  created_at: string;
  itemCount: number;
};

export type ServicePackageDetail = ServicePackageListItem & {
  items: ServicePackageItemDetail[];
};

export type ServicePackageItemDetail = {
  id: string;
  service_id: string;
  service_name: string;
  quantity: number;
};

export type CustomerPackageItemBalance = {
  id: string;
  service_id: string;
  service_name: string;
  quantity_total: number;
  quantity_used: number;
  quantity_remaining: number;
};

export type CustomerPackageListItem = {
  id: string;
  package_name_snapshot: string;
  pet_id: string;
  pet_name: string;
  customer_id: string;
  customer_name: string;
  status: CustomerPackageStatus;
  starts_at: string;
  expires_at: string;
  price_cents_snapshot: number;
  purchased_at: string;
  items: CustomerPackageItemBalance[];
  total_used: number;
  total_quantity: number;
  total_remaining: number;
};

export type CustomerPackageUsageItem = {
  id: string;
  service_name: string;
  used_at: string;
  status: "consumed" | "reversed";
  service_order_id: string;
};

export type PackageCreditOption = {
  customerPackageId: string;
  packageName: string;
  serviceName: string;
  remaining: number;
  expiresAt: string;
};
