import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  type AllowedAttachmentMimeType,
} from "@/features/attachments/constants";

export type FileInspectionResult =
  | { ok: true; mimeType: AllowedAttachmentMimeType; maxBytes: number }
  | { ok: false; error: "invalid_mime_type" | "invalid_file_size" | "invalid_file_content" };

const HEADER_BYTES = 16;

function bytesMatch(header: Uint8Array, signature: number[], offset = 0): boolean {
  if (header.length < offset + signature.length) {
    return false;
  }

  return signature.every((byte, index) => header[offset + index] === byte);
}

export function detectMimeFromMagicBytes(header: Uint8Array): AllowedAttachmentMimeType | null {
  if (bytesMatch(header, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (bytesMatch(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (
    bytesMatch(header, [0x52, 0x49, 0x46, 0x46]) &&
    bytesMatch(header, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }

  if (bytesMatch(header, [0x25, 0x50, 0x44, 0x46])) {
    return "application/pdf";
  }

  return null;
}

export function inspectDeclaredAndDetectedMime(
  declaredMime: string,
  header: Uint8Array,
  sizeBytes: number,
): FileInspectionResult {
  const detected = detectMimeFromMagicBytes(header);

  if (!detected) {
    return { ok: false, error: "invalid_file_content" };
  }

  if (
    declaredMime &&
    ALLOWED_ATTACHMENT_MIME_TYPES.includes(declaredMime as AllowedAttachmentMimeType) &&
    declaredMime !== detected
  ) {
    return { ok: false, error: "invalid_file_content" };
  }

  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(detected)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  const maxBytes = detected === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (sizeBytes <= 0 || sizeBytes > maxBytes) {
    return { ok: false, error: "invalid_file_size" };
  }

  return { ok: true, mimeType: detected, maxBytes };
}

export async function inspectUploadFile(file: File): Promise<FileInspectionResult> {
  const declared = file.type;
  const maxCandidate = declared === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;

  if (file.size <= 0 || file.size > maxCandidate) {
    return { ok: false, error: "invalid_file_size" };
  }

  const headerBuffer = await file.slice(0, HEADER_BYTES).arrayBuffer();
  return inspectDeclaredAndDetectedMime(declared, new Uint8Array(headerBuffer), file.size);
}

export async function inspectOptionalImageThumb(
  file: File | null,
): Promise<FileInspectionResult | { ok: true; mimeType: null; maxBytes: number }> {
  if (!file) {
    return { ok: true, mimeType: null, maxBytes: MAX_IMAGE_BYTES };
  }

  const inspected = await inspectUploadFile(file);
  if (!inspected.ok) {
    return inspected;
  }

  if (inspected.mimeType === "application/pdf") {
    return { ok: false, error: "invalid_file_content" };
  }

  return inspected;
}
