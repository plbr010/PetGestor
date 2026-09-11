import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_UPLOAD_BYTES,
  type AllowedAttachmentMimeType,
} from "@/features/attachments/constants";

const JPEG_SOI = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // %PDF
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export type DetectedFileKind = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export type FileSignatureResult =
  | { ok: true; mimeType: DetectedFileKind }
  | { ok: false; error: "invalid_file_signature" | "invalid_image_payload" };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }

  return signature.every((value, index) => bytes[offset + index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function hasJpegSof(bytes: Uint8Array): boolean {
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0x00 || marker === 0xff) {
      offset += 1;
      continue;
    }

    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = readU16BE(bytes, offset + 5);
      const width = readU16BE(bytes, offset + 7);
      return width > 0 && height > 0 && width <= 20000 && height <= 20000;
    }

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const size = readU16BE(bytes, offset + 2);
    if (size < 2) {
      return false;
    }
    offset += 2 + size;
  }

  return false;
}

function isValidPng(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, PNG_SIGNATURE)) {
    return false;
  }

  if (bytes.length < 24) {
    return false;
  }

  if (asciiAt(bytes, 12, 4) !== "IHDR") {
    return false;
  }

  const width = readU32BE(bytes, 16);
  const height = readU32BE(bytes, 20);
  return width > 0 && height > 0 && width <= 20000 && height <= 20000;
}

function isValidWebp(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, RIFF) || !startsWith(bytes, WEBP, 8)) {
    return false;
  }

  if (bytes.length < 16) {
    return false;
  }

  const fourcc = asciiAt(bytes, 12, 4);
  return fourcc === "VP8 " || fourcc === "VP8L" || fourcc === "VP8X";
}

function isValidPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, PDF_SIGNATURE);
}

function isValidJpeg(bytes: Uint8Array): boolean {
  return startsWith(bytes, JPEG_SOI) && hasJpegSof(bytes);
}

export function detectFileSignature(bytes: Uint8Array): FileSignatureResult {
  if (startsWith(bytes, JPEG_SOI)) {
    return isValidJpeg(bytes)
      ? { ok: true, mimeType: "image/jpeg" }
      : { ok: false, error: "invalid_image_payload" };
  }

  if (startsWith(bytes, PNG_SIGNATURE)) {
    return isValidPng(bytes)
      ? { ok: true, mimeType: "image/png" }
      : { ok: false, error: "invalid_image_payload" };
  }

  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return isValidWebp(bytes)
      ? { ok: true, mimeType: "image/webp" }
      : { ok: false, error: "invalid_image_payload" };
  }

  if (startsWith(bytes, PDF_SIGNATURE)) {
    return isValidPdf(bytes)
      ? { ok: true, mimeType: "application/pdf" }
      : { ok: false, error: "invalid_file_signature" };
  }

  return { ok: false, error: "invalid_file_signature" };
}

const EXT_BY_MIME: Record<DetectedFileKind, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

export function extensionMatchesMime(fileName: string, mimeType: DetectedFileKind): boolean {
  const trimmed = fileName.trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0 || trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    return true;
  }

  const ext = trimmed.slice(dot + 1);
  if (!ext) {
    return true;
  }

  return EXT_BY_MIME[mimeType].includes(ext);
}

export function declaredMimeAgrees(
  declaredMime: string,
  detected: DetectedFileKind,
): boolean {
  const declared = declaredMime.trim().toLowerCase();
  if (!declared || declared === "application/octet-stream") {
    return true;
  }

  return declared === detected;
}

const HEADER_BYTES = 64 * 1024;

export type InspectedUpload =
  | {
      ok: true;
      mimeType: AllowedAttachmentMimeType;
      maxBytes: number;
    }
  | {
      ok: false;
      error:
        | "invalid_mime_type"
        | "invalid_file_size"
        | "invalid_file_signature"
        | "invalid_image_payload"
        | "invalid_file_extension";
    };

export async function inspectUploadFile(
  file: File,
  options?: { imagesOnly?: boolean },
): Promise<InspectedUpload> {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "invalid_file_size" };
  }

  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const signature = detectFileSignature(header);
  if (!signature.ok) {
    return { ok: false, error: signature.error };
  }

  if (options?.imagesOnly && !(IMAGE_MIME_TYPES as readonly string[]).includes(signature.mimeType)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(signature.mimeType)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  if (!declaredMimeAgrees(file.type, signature.mimeType)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  if (!extensionMatchesMime(file.name, signature.mimeType)) {
    return { ok: false, error: "invalid_file_extension" };
  }

  const maxBytes = signature.mimeType === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return { ok: false, error: "invalid_file_size" };
  }

  return { ok: true, mimeType: signature.mimeType, maxBytes };
}
