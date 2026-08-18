import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  type AllowedAttachmentMimeType,
} from "@/features/attachments/constants";

export type FileValidationResult =
  | { ok: true; mimeType: AllowedAttachmentMimeType; maxBytes: number }
  | { ok: false; error: string };

export function validateAttachmentMeta(
  mimeType: string,
  sizeBytes: number,
): FileValidationResult {
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType as AllowedAttachmentMimeType)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  const allowed = mimeType as AllowedAttachmentMimeType;
  const maxBytes = allowed === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;

  if (sizeBytes <= 0 || sizeBytes > maxBytes) {
    return { ok: false, error: "invalid_file_size" };
  }

  return { ok: true, mimeType: allowed, maxBytes };
}

export function mapAttachmentValidationError(code: string): string {
  if (code === "invalid_mime_type") {
    return "Tipo de arquivo não permitido. Use JPG, PNG, WebP ou PDF.";
  }

  if (code === "invalid_file_size") {
    return "Arquivo muito grande. Imagens até 8 MB e PDFs até 10 MB.";
  }

  if (code === "pet_not_found" || code === "service_order_not_found") {
    return "Não foi possível encontrar o registro solicitado.";
  }

  if (code === "storage_upload_failed") {
    return "Falha ao enviar o arquivo. Tente novamente.";
  }

  return "Não foi possível concluir o envio. Verifique o arquivo e tente novamente.";
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
