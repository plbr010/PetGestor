"use server";

import { revalidatePath } from "next/cache";

import { uploadPetPhoto } from "@/features/attachments/upload-pet-photo";
import {
  buildPetAttachmentPaths,
  buildServiceOrderAttachmentPaths,
  extensionForMimeType,
  sanitizeFileName,
} from "@/features/attachments/paths";
import {
  parsePetAttachmentUploadForm,
  parseServiceOrderAttachmentUploadForm,
} from "@/features/attachments/schemas";
import { removeFromCompanyStorage, uploadToCompanyStorage } from "@/features/attachments/storage";
import {
  mapAttachmentValidationError,
  validateAttachmentMeta,
} from "@/features/attachments/validation";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { rethrowNavigationErrors } from "@/lib/server-action-errors";
import { GENERIC_NOT_FOUND_MESSAGE } from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServiceOrderById } from "@/features/service-orders/queries";

export type AttachmentActionState = {
  error?: string;
  success?: string;
};

async function getUploaderName(userId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const name = data?.full_name?.trim();
  return name && name.length > 0 ? name : "Usuário";
}

function revalidatePetPaths(petId: string) {
  revalidatePath("/dashboard/pets");
  revalidatePath(`/dashboard/pets/${petId}`);
}

function revalidateServiceOrderPaths(serviceOrderId: string, petId?: string) {
  revalidatePath("/dashboard/atendimentos");
  revalidatePath(`/dashboard/atendimentos/${serviceOrderId}`);
  if (petId) {
    revalidatePetPaths(petId);
  }
}

async function readUploadFile(formData: FormData, fieldName: string) {
  const value = formData.get(fieldName);
  if (!(value instanceof File) || value.size <= 0) {
    return null;
  }

  return value;
}

async function readOptionalThumb(formData: FormData) {
  const value = formData.get("thumbFile");
  if (!(value instanceof File) || value.size <= 0) {
    return null;
  }

  return value;
}

export async function uploadPetPhotoAction(
  prevState: AttachmentActionState,
  formData: FormData,
): Promise<AttachmentActionState> {
  void prevState;

  try {
    const petId = formData.get("petId");
    if (typeof petId !== "string") {
      return { error: "Dados inválidos." };
    }

    return await uploadPetPhoto(petId, formData);
  } catch (error) {
    rethrowNavigationErrors(error);
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }
}

export async function removePetPhotoAction(
  petId: string,
  prevState: AttachmentActionState,
  formData: FormData,
): Promise<AttachmentActionState> {
  void prevState;
  void formData;
  if (!isValidUuid(petId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const companyId = context.membership.company.id;
  const supabase = await createSupabaseServerClient();

  const { data: pet } = await supabase
    .from("pets")
    .select("photo_storage_path, photo_thumb_path")
    .eq("company_id", companyId)
    .eq("id", petId)
    .maybeSingle();

  if (!pet) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const { data, error } = await supabase
    .from("pets")
    .update({
      photo_storage_path: null,
      photo_thumb_path: null,
      photo_updated_at: null,
    })
    .eq("company_id", companyId)
    .eq("id", petId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Não foi possível remover a foto." };
  }

  await removeFromCompanyStorage(
    [pet.photo_storage_path, pet.photo_thumb_path].filter(Boolean) as string[],
  );

  revalidatePetPaths(petId);
  return { success: "Foto removida." };
}

export async function uploadPetAttachmentAction(
  prevState: AttachmentActionState,
  formData: FormData,
): Promise<AttachmentActionState> {
  void prevState;
  const context = await requireCompanyContext();
  const parsed = parsePetAttachmentUploadForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const file = await readUploadFile(formData, "file");
  const thumbFile = await readOptionalThumb(formData);

  if (!file) {
    return { error: "Selecione um arquivo para enviar." };
  }

  const validation = validateAttachmentMeta(file.type, file.size);
  if (!validation.ok) {
    return { error: mapAttachmentValidationError(validation.error) };
  }

  const companyId = context.membership.company.id;
  const supabase = await createSupabaseServerClient();
  const { data: pet } = await supabase
    .from("pets")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", parsed.data.petId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!pet) {
    return { error: mapAttachmentValidationError("pet_not_found") };
  }

  const attachmentId = crypto.randomUUID();
  const ext = extensionForMimeType(validation.mimeType) ?? "bin";
  const paths = buildPetAttachmentPaths(companyId, parsed.data.petId, attachmentId, ext);
  const uploadResult = await uploadToCompanyStorage(paths.filePath, file, validation.mimeType);

  if (uploadResult.error) {
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }

  if (thumbFile && validation.mimeType !== "application/pdf") {
    const thumbUpload = await uploadToCompanyStorage(paths.thumbPath, thumbFile, "image/webp");
    if (thumbUpload.error) {
      await removeFromCompanyStorage([paths.filePath]);
      return { error: mapAttachmentValidationError("storage_upload_failed") };
    }
  }

  const uploaderName = await getUploaderName(context.user.id);
  const { error } = await supabase.from("pet_attachments").insert({
    id: attachmentId,
    company_id: companyId,
    pet_id: parsed.data.petId,
    file_path: paths.filePath,
    thumb_path: thumbFile ? paths.thumbPath : null,
    file_name: sanitizeFileName(file.name),
    mime_type: validation.mimeType,
    size_bytes: file.size,
    category: parsed.data.category,
    description: parsed.data.description,
    uploaded_by: context.user.id,
    uploaded_by_name: uploaderName,
  });

  if (error) {
    await removeFromCompanyStorage([paths.filePath, paths.thumbPath]);
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }

  revalidatePetPaths(parsed.data.petId);
  return { success: "Arquivo enviado com sucesso." };
}

export async function archivePetAttachmentAction(
  attachmentId: string,
): Promise<AttachmentActionState> {
  if (!isValidUuid(attachmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pet_attachments")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: context.user.id,
    })
    .eq("company_id", context.membership.company.id)
    .eq("id", attachmentId)
    .is("archived_at", null)
    .select("pet_id, file_path, thumb_path")
    .maybeSingle();

  if (error || !data) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await removeFromCompanyStorage(
    [data.file_path, data.thumb_path].filter(Boolean) as string[],
  );

  revalidatePetPaths(data.pet_id);
  return { success: "Arquivo arquivado." };
}

export async function uploadServiceOrderAttachmentAction(
  prevState: AttachmentActionState,
  formData: FormData,
): Promise<AttachmentActionState> {
  void prevState;
  const context = await requireCompanyContext();
  const parsed = parseServiceOrderAttachmentUploadForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const file = await readUploadFile(formData, "file");
  const thumbFile = await readOptionalThumb(formData);

  if (!file) {
    return { error: "Selecione um arquivo para enviar." };
  }

  const validation = validateAttachmentMeta(file.type, file.size);
  if (!validation.ok) {
    return { error: mapAttachmentValidationError(validation.error) };
  }

  const companyId = context.membership.company.id;
  const order = await getServiceOrderById(companyId, parsed.data.serviceOrderId);
  const petId = order?.appointment.pet.id;

  if (!order || !petId) {
    return { error: mapAttachmentValidationError("service_order_not_found") };
  }

  const supabase = await createSupabaseServerClient();
  const attachmentId = crypto.randomUUID();
  const ext = extensionForMimeType(validation.mimeType) ?? "bin";
  const paths = buildServiceOrderAttachmentPaths(
    companyId,
    parsed.data.serviceOrderId,
    attachmentId,
    ext,
  );
  const uploadResult = await uploadToCompanyStorage(paths.filePath, file, validation.mimeType);

  if (uploadResult.error) {
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }

  if (thumbFile && validation.mimeType !== "application/pdf") {
    const thumbUpload = await uploadToCompanyStorage(paths.thumbPath, thumbFile, "image/webp");
    if (thumbUpload.error) {
      await removeFromCompanyStorage([paths.filePath]);
      return { error: mapAttachmentValidationError("storage_upload_failed") };
    }
  }

  const uploaderName = await getUploaderName(context.user.id);
  const { error } = await supabase.from("service_order_attachments").insert({
    id: attachmentId,
    company_id: companyId,
    service_order_id: parsed.data.serviceOrderId,
    pet_id: petId,
    file_path: paths.filePath,
    thumb_path: thumbFile ? paths.thumbPath : null,
    file_name: sanitizeFileName(file.name),
    mime_type: validation.mimeType,
    size_bytes: file.size,
    category: parsed.data.category,
    phase: parsed.data.phase,
    description: parsed.data.description,
    uploaded_by: context.user.id,
    uploaded_by_name: uploaderName,
  });

  if (error) {
    await removeFromCompanyStorage([paths.filePath, paths.thumbPath]);
    return { error: mapAttachmentValidationError("storage_upload_failed") };
  }

  revalidateServiceOrderPaths(parsed.data.serviceOrderId, petId);
  return { success: "Anexo do atendimento enviado." };
}

export async function archiveServiceOrderAttachmentAction(
  attachmentId: string,
): Promise<AttachmentActionState> {
  if (!isValidUuid(attachmentId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requireCompanyContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_order_attachments")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: context.user.id,
    })
    .eq("company_id", context.membership.company.id)
    .eq("id", attachmentId)
    .is("archived_at", null)
    .select("service_order_id, pet_id, file_path, thumb_path")
    .maybeSingle();

  if (error || !data) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  await removeFromCompanyStorage(
    [data.file_path, data.thumb_path].filter(Boolean) as string[],
  );

  revalidateServiceOrderPaths(data.service_order_id, data.pet_id);
  return { success: "Anexo arquivado." };
}
