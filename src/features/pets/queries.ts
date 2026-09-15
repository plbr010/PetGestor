import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import type { PetDetail, PetListItem, PetSpeciesFilter } from "@/features/pets/types";
import { buildPetPhotoThumbMap } from "@/features/pets/enrich-photo-thumbs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAGE_SIZE,
  getPaginationRange,
  type PaginatedResult,
  parsePageParam,
  resolvePaginatedRange,
  sanitizeSearchTerm,
} from "@/lib/pagination";
import type { PetSpecies } from "@/types/database.types";
import { isValidUuid } from "@/lib/security/uuid";
import { isMissingSchemaError } from "@/lib/supabase/schema-errors";

type GetPetsParams = {
  companyId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  species?: PetSpeciesFilter;
  customerId?: string;
  includeArchived?: boolean;
};

export async function getPets({
  companyId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  species = "all",
  customerId,
  includeArchived = false,
}: GetPetsParams): Promise<PaginatedResult<PetListItem>> {
  noStore();

  const supabase = await createSupabaseServerClient();
  const safePage = parsePageParam(String(page));
  const { from, to } = getPaginationRange(safePage, pageSize);
  const search = sanitizeSearchTerm(query);
  const loadErrorMessage = "Não foi possível carregar os pets.";

  const applyFilters = <
    T extends {
      is: (column: string, value: null) => T;
      eq: (column: string, value: string) => T;
      or: (filters: string) => T;
    },
  >(
    builder: T,
  ): T => {
    let next = builder;
    if (!includeArchived) {
      next = next.is("deleted_at", null);
    }
    if (customerId && isValidUuid(customerId)) {
      next = next.eq("customer_id", customerId);
    }
    if (species !== "all") {
      next = next.eq("species", species as PetSpecies);
    }
    if (search) {
      next = next.or(`name.ilike.%${search}%,breed.ilike.%${search}%`);
    }
    return next;
  };

  const result = await resolvePaginatedRange({
    page: safePage,
    pageSize,
    loadErrorMessage,
    fetchPage: async () => {
      const pageBuilder = applyFilters(
        supabase
          .from("pets")
          .select(
            "id, name, species, breed, birth_date, created_at, customer_id, photo_thumb_path, photo_storage_path, customers!inner(name)",
            { count: "exact" },
          )
          .eq("company_id", companyId)
          .order("name", { ascending: true }),
      );

      let { data, error, count } = await pageBuilder.range(from, to);

      if (error && isMissingSchemaError(error)) {
        const fallbackBuilder = applyFilters(
          supabase
            .from("pets")
            .select(
              "id, name, species, breed, birth_date, created_at, customer_id, customers!inner(name)",
              { count: "exact" },
            )
            .eq("company_id", companyId)
            .order("name", { ascending: true }),
        );
        const fallback = await fallbackBuilder.range(from, to);
        data =
          fallback.data?.map((row) => ({
            ...row,
            photo_thumb_path: null,
            photo_storage_path: null,
          })) ?? null;
        error = fallback.error;
        count = fallback.count;
      }

      return { data, count, error };
    },
    fetchCount: async () => {
      const countBuilder = applyFilters(
        supabase
          .from("pets")
          .select("id, customers!inner(name)", { count: "exact", head: true })
          .eq("company_id", companyId),
      );
      let { count, error } = await countBuilder;

      if (error && isMissingSchemaError(error)) {
        const fallbackCount = applyFilters(
          supabase
            .from("pets")
            .select("id, customers!inner(name)", { count: "exact", head: true })
            .eq("company_id", companyId),
        );
        const fallback = await fallbackCount;
        count = fallback.count;
        error = fallback.error;
      }

      return { count, error };
    },
  });

  const thumbMap = await buildPetPhotoThumbMap(
    companyId,
    result.data.map((row) => ({
      id: row.id,
      photo_thumb_path: row.photo_thumb_path as string | null | undefined,
      photo_storage_path: row.photo_storage_path as string | null | undefined,
    })),
  );

  return {
    ...result,
    data: result.data.map((row) => ({
      id: row.id,
      name: row.name,
      species: row.species,
      breed: row.breed,
      birth_date: row.birth_date,
      created_at: row.created_at,
      customer_id: row.customer_id,
      customerName:
        (row.customers as { name: string } | null)?.name ?? "Tutor não encontrado",
      photoThumbUrl: thumbMap.get(row.id) ?? null,
    })),
  };
}

export async function getPetById(
  companyId: string,
  petId: string,
  options?: { includeArchived?: boolean },
): Promise<PetDetail | null> {
  noStore();

  if (!isValidUuid(petId) || !isValidUuid(companyId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from("pets")
    .select("*, customers!inner(id, name, phone)")
    .eq("company_id", companyId)
    .eq("id", petId);

  if (!options?.includeArchived) {
    builder = builder.is("deleted_at", null);
  }

  const { data, error } = await builder.maybeSingle();

  if (error || !data) {
    return null;
  }

  const customer = data.customers as { id: string; name: string; phone: string };

  return {
    id: data.id,
    company_id: data.company_id,
    customer_id: data.customer_id,
    name: data.name,
    species: data.species,
    breed: data.breed,
    sex: data.sex,
    birth_date: data.birth_date,
    weight_kg: data.weight_kg,
    color: data.color,
    allergies: data.allergies,
    notes: data.notes,
    important_notes: data.important_notes,
    photo_storage_path: data.photo_storage_path,
    photo_thumb_path: data.photo_thumb_path,
    photo_updated_at: data.photo_updated_at,
    created_by: data.created_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
    deleted_at: data.deleted_at,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
    },
  };
}

export async function requirePetById(companyId: string, petId: string): Promise<PetDetail> {
  const pet = await getPetById(companyId, petId);

  if (!pet) {
    notFound();
  }

  return pet;
}

export async function getPetsByCustomer(
  companyId: string,
  customerId: string,
): Promise<PetListItem[]> {
  if (!isValidUuid(companyId) || !isValidUuid(customerId)) {
    return [];
  }

  const result = await getPets({
    companyId,
    customerId,
    page: 1,
    pageSize: 100,
  });

  return result.data;
}

export async function countActivePets(companyId: string): Promise<number> {
  noStore();

  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("pets")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if (error) {
    return 0;
  }

  return count ?? 0;
}
