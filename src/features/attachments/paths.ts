const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function extensionForMimeType(mimeType: string): string | null {
  return MIME_TO_EXT[mimeType] ?? null;
}

export function buildPetPhotoPaths(companyId: string, petId: string, ext: string) {
  const base = `${companyId}/pets/${petId}/photo`;
  return {
    filePath: `${base}/main.${ext}`,
    thumbPath: `${base}/thumb.webp`,
  };
}

export function buildPetAttachmentPaths(
  companyId: string,
  petId: string,
  attachmentId: string,
  ext: string,
) {
  const base = `${companyId}/pets/${petId}/attachments/${attachmentId}`;
  return {
    filePath: `${base}/file.${ext}`,
    thumbPath: `${base}/thumb.webp`,
  };
}

export function buildServiceOrderAttachmentPaths(
  companyId: string,
  serviceOrderId: string,
  attachmentId: string,
  ext: string,
) {
  const base = `${companyId}/service-orders/${serviceOrderId}/${attachmentId}`;
  return {
    filePath: `${base}/file.${ext}`,
    thumbPath: `${base}/thumb.webp`,
  };
}

export function isPathInCompany(companyId: string, storagePath: string): boolean {
  return storagePath.startsWith(`${companyId}/`);
}

export function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[/\\?%*:|"<>]/g, "-");
  return trimmed.slice(0, 255) || "arquivo";
}
