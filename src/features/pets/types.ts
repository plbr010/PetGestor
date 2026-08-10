import type { CustomerOption } from "@/features/customers/types";
import type { Pet, PetSpecies, PetSex } from "@/types/database.types";

export type PetListItem = Pick<
  Pet,
  "id" | "name" | "species" | "breed" | "birth_date" | "created_at" | "customer_id"
> & {
  customerName: string;
};

export type PetDetail = Pet & {
  customer: CustomerOption;
};

export type PetSpeciesFilter = PetSpecies | "all";

export { type PetSpecies, type PetSex };
