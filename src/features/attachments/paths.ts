const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function isSafePathSegment(value: string): boolean {
  return Boolean(value) && !/[\\/\0]/.test(value) && !value.includes("..");
}

export function extensionForMimeType(mimeType: string): string | null {
  return MIME_TO_EXT[mimeType] ?? null;
}

export function buildPetPhotoPaths(
  companyId: string,
  petId: string,
  ext: string,
  assetId = crypto.randomUUID(),
) {
  if (
    !isSafePathSegment(companyId) ||
    !isSafePathSegment(petId) ||
    !isSafePathSegment(ext) ||
    !isSafePathSegment(assetId)
  ) {
    throw new Error("invalid_storage_path_segment");
  }

  const base = `${companyId}/pets/${petId}/photo`;
  return {
    filePath: `${base}/${assetId}.${ext}`,
    thumbPath: `${base}/${assetId}-thumb.webp`,
    assetId,
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
  if (!companyId || !storagePath) {
    return false;
  }

  if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.includes("\0")) {
    return false;
  }

  return storagePath.startsWith(`${companyId}/`);
}

export function sanitizeFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "arquivo";
  const trimmed = base.trim().replace(/[/\\?%*:|"<>]/g, "-").replace(/\.\.+/g, ".");
  return trimmed.slice(0, 255) || "arquivo";
}

export function pathsToRemoveAfterPhotoPersist(
  oldPaths: Array<string | null | undefined>,
  nextPaths: string[],
): string[] {
  const next = new Set(nextPaths.filter(Boolean));
  return oldPaths.filter((path): path is string => {
    return typeof path === "string" && path.length > 0 && !next.has(path);
  });
}
