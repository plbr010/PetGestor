import "server-only";

import { revalidatePath } from "next/cache";

import { buildPetPhotoPaths, extensionForMimeType } from "@/features/attachments/paths";
import { petPhotoUploadSchema } from "@/features/attachments/schemas";
import { removeFromCompanyStorage, uploadToCompanyStorage } from "@/features/attachments/storage";
import { mapAttachmentValidationError } from "@/features/attachments/validation";
import { inspectUploadFile } from "@/lib/security/file-signature";
import { requirePermission } from "@/lib/auth/require-permission";
import { GENERIC_NOT_FOUND_MESSAGE } from "@/lib/security/tenant-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PetPhotoUploadResult = {
  error?: string;
  success?: string;
};

function revalidatePetPaths(petId: string) {
  revalidatePath("/dashboard/pets");
  revalidatePath(`/dashboard/pets/${petId}`);
}

function readUploadFile(formData: FormData, fieldName: string): File | null {
  const value = formData.get(fieldName);
  if (!(value instanceof File) || value.size <= 0) {
    return null;
  }

  return value;
}

function readOptionalThumb(formData: FormData): File | null {
  const value = formData.get("thumbFile");
  if (!(value instanceof File) || value.size <= 0) {
    return null;
  }

  return value;
}

async function cleanupNewFiles(paths: string[]): Promise<void> {
  const result = await removeFromCompanyStorage(paths);
  if (result.error && process.env.NODE_ENV === "development") {
    console.info("[storage] orphan_cleanup_failed", { name: result.error.name ?? null });
  }
}

/**
 * Substituição fail-safe:
 * 1. valida o arquivo novo
 * 2. gera path único
 * 3. faz upload do novo
 * 4. persiste no banco
 * 5. só então remove o arquivo antigo
 *
 * Se 2–4 falhar, a foto antiga permanece. Órfão novo é limpo em best-effort
 * sem esconder o erro principal.
 */
export async function uploadPetPhoto(
  petId: string,
  formData: FormData,
): Promise<PetPhotoUploadResult> {
  const parsed = petPhotoUploadSchema.safeParse({ petId });

  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }

  const file = readUploadFile(formData, "file");
  const thumbFile = readOptionalThumb(formData);

  if (!file) {
    return { error: "Selecione uma foto para enviar." };
  }

  const inspection = await inspectUploadFile(file, { imagesOnly: true });
  if (!inspection.ok) {
    return { error: mapAttachmentValidationError(inspection.error) };
  }

  if (thumbFile) {
    const thumbInspection = await inspectUploadFile(thumbFile, { imagesOnly: true });
    if (!thumbInspection.ok) {
      return { error: mapAttachmentValidationError("invalid_image_payload") };
    }
  }

  const context = await requirePermission("pets.edit");
  const companyId = context.membership.company.id;
  const supabase = await createSupabaseServerClient();

  const petWithPhoto = await supabase
    .from("pets")
    .select("id, photo_storage_path, photo_thumb_path")
    .eq("company_id", companyId)
    .eq("id", petId)
    .is("deleted_at", null)
    .maybeSingle();

  const pet = petWithPhoto.data;
  if (petWithPhoto.error) {
    const petFallback = await supabase
      .from("pets")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", petId)
      .is("deleted_at", null)
      .maybeSingle();

    if (petFallback.error || !petFallback.data) {
      return { error: GENERIC_NOT_FOUND_MESSAGE };
    }

    return { error: mapAttachmentValidationError("attachments_migration_required") };
  }

  if (!pet) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const ext = extensionForMimeType(inspection.mimeType) ?? "webp";
  const paths = buildPetPhotoPaths(companyId, petId, ext);
  const contentType = thumbFile ? "image/webp" : inspection.mimeType;
  const newPaths = [paths.filePath, paths.thumbPath];

  const uploadResult = await uploadToCompanyStorage(paths.filePath, file, contentType);
  if (uploadResult.error) {
    await cleanupNewFiles([paths.filePath]);
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }

  let thumbPath: string | null = null;

  if (thumbFile) {
    const thumbUpload = await uploadToCompanyStorage(paths.thumbPath, thumbFile, "image/webp");
    if (thumbUpload.error) {
      await cleanupNewFiles(newPaths);
      return { error: mapAttachmentValidationError("storage_upload_failed") };
    }
    thumbPath = paths.thumbPath;
  } else {
    const thumbUpload = await uploadToCompanyStorage(paths.thumbPath, file, contentType);
    if (thumbUpload.error) {
      await cleanupNewFiles(newPaths);
      return { error: mapAttachmentValidationError("invalid_image_payload") };
    }
    thumbPath = paths.thumbPath;
  }

  const oldPaths = [pet.photo_storage_path, pet.photo_thumb_path].filter(
    (path): path is string => Boolean(path) && path !== paths.filePath && path !== paths.thumbPath,
  );

  const { error } = await supabase
    .from("pets")
    .update({
      photo_storage_path: paths.filePath,
      photo_thumb_path: thumbPath,
      photo_updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("id", petId);

  if (error) {
    await cleanupNewFiles(newPaths);
    if (error.code === "42703" || error.message?.includes("photo_storage_path")) {
      return { error: mapAttachmentValidationError("attachments_migration_required") };
    }
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }

  if (oldPaths.length > 0) {
    const removed = await removeFromCompanyStorage(oldPaths);
    if (removed.error && process.env.NODE_ENV === "development") {
      console.info("[storage] old_photo_cleanup_failed", { name: removed.error.name ?? null });
    }
  }

  revalidatePetPaths(petId);
  return { success: "Foto do pet atualizada." };
}
