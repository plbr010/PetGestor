import "server-only";

import { revalidatePath } from "next/cache";

import {
  inspectOptionalImageThumb,
  inspectUploadFile,
} from "@/features/attachments/file-signature";
import {
  buildPetPhotoPaths,
  extensionForMimeType,
  pathsToRemoveAfterPhotoPersist,
} from "@/features/attachments/paths";
import { petPhotoUploadSchema } from "@/features/attachments/schemas";
import { removeFromCompanyStorage, uploadToCompanyStorage } from "@/features/attachments/storage";
import { mapAttachmentValidationError } from "@/features/attachments/validation";
import { requirePermission } from "@/lib/auth/require-permission";
import { GENERIC_NOT_FOUND_MESSAGE } from "@/lib/security/tenant-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstIssueMessage } from "@/lib/validation/first-issue-message";

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
    return { error: firstIssueMessage(parsed.error.issues, "Dados inválidos.") };
  }

  const file = readUploadFile(formData, "file");
  const thumbFile = readOptionalThumb(formData);

  if (!file) {
    return { error: "Selecione uma foto para enviar." };
  }

  const validation = await inspectUploadFile(file);
  if (!validation.ok || validation.mimeType === "application/pdf") {
    return {
      error: mapAttachmentValidationError(
        validation.ok ? "invalid_mime_type" : validation.error,
      ),
    };
  }

  const thumbInspection = await inspectOptionalImageThumb(thumbFile);
  if (!thumbInspection.ok) {
    return { error: mapAttachmentValidationError("invalid_thumbnail") };
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

  const oldPaths = pathsToRemoveAfterPhotoPersist(
    [pet.photo_storage_path, pet.photo_thumb_path],
    [paths.filePath, thumbPath ?? ""],
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
    // Best-effort: remove only the NEW orphan. Never delete the old photo here.
    await removeFromCompanyStorage([paths.filePath, paths.thumbPath]);
    if (error.code === "42703" || error.message?.includes("photo_storage_path")) {
      return { error: mapAttachmentValidationError("attachments_migration_required") };
    }
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }

  if (oldPaths.length > 0) {
    const cleanup = await removeFromCompanyStorage(oldPaths);
    if (cleanup.error && process.env.NODE_ENV === "development") {
      console.info("[pet-photo] old file cleanup failed after persist");
    }
  }

  revalidatePetPaths(petId);
  return { success: "Foto do pet atualizada." };
}
