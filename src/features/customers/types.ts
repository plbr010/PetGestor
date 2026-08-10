import type { Customer } from "@/types/database.types";

export type CustomerListItem = Pick<
  Customer,
  "id" | "name" | "phone" | "email" | "created_at"
> & {
  petsCount: number;
};

export type CustomerDetail = Customer;

export type CustomerOption = Pick<Customer, "id" | "name" | "phone">;
