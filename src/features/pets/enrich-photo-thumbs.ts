import { getPetPhotoThumbMap } from "@/features/attachments/queries";

import type { PetChip } from "@/features/pets/types";

export async function buildPetPhotoThumbMap(
  companyId: string,
  pets: Array<{ id: string; photo_thumb_path?: string | null }>,
): Promise<Map<string, string | null>> {
  const unique = [...new Map(pets.map((pet) => [pet.id, pet])).values()];

  return getPetPhotoThumbMap(
    companyId,
    unique.map((pet) => ({
      id: pet.id,
      photo_thumb_path: pet.photo_thumb_path ?? null,
    })),
  );
}

export function withPetPhotoThumb<T extends { id: string; name: string }>(
  pet: T,
  thumbMap: Map<string, string | null>,
): PetChip {
  return {
    id: pet.id,
    name: pet.name,
    photoThumbUrl: thumbMap.get(pet.id) ?? null,
  };
}
