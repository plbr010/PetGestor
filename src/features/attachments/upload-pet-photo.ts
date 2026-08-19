import "server-only";

import { revalidatePath } from "next/cache";

import { buildPetPhotoPaths, extensionForMimeType } from "@/features/attachments/paths";
import { petPhotoUploadSchema } from "@/features/attachments/schemas";
import { removeFromCompanyStorage, uploadToCompanyStorage } from "@/features/attachments/storage";
import {
  mapAttachmentValidationError,
  validateAttachmentMeta,
} from "@/features/attachments/validation";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
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

  const validation = validateAttachmentMeta(file.type, file.size);
  if (!validation.ok || validation.mimeType === "application/pdf") {
    return {
      error: mapAttachmentValidationError(
        validation.ok ? "invalid_mime_type" : validation.error,
      ),
    };
  }

  const context = await requireCompanyContext();
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

  const ext = extensionForMimeType(validation.mimeType) ?? "webp";
  const paths = buildPetPhotoPaths(companyId, petId, ext);
  const contentType = thumbFile ? "image/webp" : validation.mimeType;

  const uploadResult = await uploadToCompanyStorage(paths.filePath, file, contentType);
  if (uploadResult.error) {
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }

  let thumbPath: string | null = null;

  if (thumbFile) {
    const thumbUpload = await uploadToCompanyStorage(paths.thumbPath, thumbFile, "image/webp");
    if (thumbUpload.error) {
      await removeFromCompanyStorage([paths.filePath]);
      return { error: mapAttachmentValidationError("storage_upload_failed") };
    }
    thumbPath = paths.thumbPath;
  } else {
    const thumbUpload = await uploadToCompanyStorage(paths.thumbPath, file, contentType);
    if (!thumbUpload.error) {
      thumbPath = paths.thumbPath;
    } else {
      thumbPath = paths.filePath;
    }
  }

  const oldPaths = [pet.photo_storage_path, pet.photo_thumb_path].filter(Boolean) as string[];
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
    await removeFromCompanyStorage([paths.filePath, paths.thumbPath]);
    if (error.code === "42703" || error.message?.includes("photo_storage_path")) {
      return { error: mapAttachmentValidationError("attachments_migration_required") };
    }
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }

  if (oldPaths.length > 0) {
    await removeFromCompanyStorage(oldPaths);
  }

  revalidatePetPaths(petId);
  return { success: "Foto do pet atualizada." };
}
