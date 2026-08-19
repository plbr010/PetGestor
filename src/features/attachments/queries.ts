import { unstable_noStore as noStore } from "next/cache";

import {
  GALLERY_PAGE_SIZE,
  type AttachmentPhase,
} from "@/features/attachments/constants";
import { createSignedStorageUrls } from "@/features/attachments/storage";
import type {
  AttachmentView,
  BeforeAfterPair,
  PetAttachmentRecord,
  PetGalleryItem,
  PetGalleryPage,
  PetPhotoView,
  ServiceOrderAttachmentRecord,
} from "@/features/attachments/types";
import { isImageMimeType } from "@/features/attachments/validation";
import {
  buildPaginatedResult,
  getPaginationRange,
  parsePageParam,
} from "@/lib/pagination";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function mapAttachmentView(
  row: {
    id: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    category: string;
    phase?: string | null;
    description: string | null;
    uploaded_by_name: string;
    created_at: string;
    thumb_path: string | null;
    file_path: string;
  },
  signedUrls: Map<string, string | null>,
): AttachmentView {
  const isImage = isImageMimeType(row.mime_type);
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    category: row.category,
    phase: (row.phase as AttachmentPhase | null) ?? null,
    description: row.description,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
    isImage,
    isPdf: row.mime_type === "application/pdf",
    thumbUrl: row.thumb_path ? (signedUrls.get(row.thumb_path) ?? null) : null,
    fileUrl: signedUrls.get(row.file_path) ?? null,
  };
}

export async function getPetPhotoView(
  companyId: string,
  pet: { photo_storage_path: string | null; photo_thumb_path: string | null; photo_updated_at: string | null },
): Promise<PetPhotoView> {
  noStore();
  const signedUrls = await createSignedStorageUrls(companyId, [
    pet.photo_storage_path,
    pet.photo_thumb_path,
  ]);

  return {
    photoUrl: pet.photo_storage_path
      ? (signedUrls.get(pet.photo_storage_path) ?? null)
      : null,
    thumbUrl: pet.photo_thumb_path ? (signedUrls.get(pet.photo_thumb_path) ?? null) : null,
    updatedAt: pet.photo_updated_at,
  };
}

export async function getPetAttachments(
  companyId: string,
  petId: string,
): Promise<AttachmentView[]> {
  noStore();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pet_attachments")
    .select(
      "id, file_path, thumb_path, file_name, mime_type, size_bytes, category, description, uploaded_by_name, created_at",
    )
    .eq("company_id", companyId)
    .eq("pet_id", petId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  const signedUrls = await createSignedStorageUrls(
    companyId,
    (data ?? []).flatMap((row) => [row.file_path, row.thumb_path]),
  );

  return (data ?? []).map((row) => mapAttachmentView(row, signedUrls));
}

export async function getServiceOrderAttachments(
  companyId: string,
  serviceOrderId: string,
): Promise<AttachmentView[]> {
  noStore();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_order_attachments")
    .select(
      "id, file_path, thumb_path, file_name, mime_type, size_bytes, category, phase, description, uploaded_by_name, created_at",
    )
    .eq("company_id", companyId)
    .eq("service_order_id", serviceOrderId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  const signedUrls = await createSignedStorageUrls(
    companyId,
    (data ?? []).flatMap((row) => [row.file_path, row.thumb_path]),
  );

  return (data ?? []).map((row) => mapAttachmentView(row, signedUrls));
}

export async function getServiceOrderAttachmentCounts(
  companyId: string,
  serviceOrderIds: string[],
): Promise<Map<string, number>> {
  noStore();

  if (serviceOrderIds.length === 0) {
    return new Map();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_order_attachments")
    .select("service_order_id")
    .eq("company_id", companyId)
    .in("service_order_id", serviceOrderIds)
    .is("archived_at", null);

  if (error) {
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.service_order_id, (counts.get(row.service_order_id) ?? 0) + 1);
  }

  return counts;
}

export function buildBeforeAfterPair(attachments: AttachmentView[]): BeforeAfterPair {
  const before =
    attachments.find((item) => item.phase === "before") ??
    attachments.find((item) => item.category === "before") ??
    null;
  const after =
    attachments.find((item) => item.phase === "after") ??
    attachments.find((item) => item.category === "after") ??
    null;

  return { before, after };
}

export async function getPetGalleryPage(
  companyId: string,
  petId: string,
  page = 1,
): Promise<PetGalleryPage> {
  noStore();

  const supabase = await createSupabaseServerClient();
  const safePage = parsePageParam(String(page));
  const { from, to } = getPaginationRange(safePage, GALLERY_PAGE_SIZE);

  const [serviceRows, petRows] = await Promise.all([
    supabase
      .from("service_order_attachments")
      .select(
        "id, file_path, thumb_path, file_name, mime_type, category, phase, description, created_at, service_order_id",
        { count: "exact" },
      )
      .eq("company_id", companyId)
      .eq("pet_id", petId)
      .is("archived_at", null)
      .neq("mime_type", "application/pdf")
      .order("created_at", { ascending: false }),
    supabase
      .from("pet_attachments")
      .select(
        "id, file_path, thumb_path, file_name, mime_type, category, description, created_at",
        { count: "exact" },
      )
      .eq("company_id", companyId)
      .eq("pet_id", petId)
      .is("archived_at", null)
      .in("mime_type", ["image/jpeg", "image/png", "image/webp"])
      .order("created_at", { ascending: false }),
  ]);

  const combined: PetGalleryItem[] = [
    ...(serviceRows.data ?? []).map((row) => ({
      id: row.id,
      source: "service_order" as const,
      fileName: row.file_name,
      mimeType: row.mime_type,
      category: row.category,
      phase: (row.phase as AttachmentPhase | null) ?? null,
      description: row.description,
      createdAt: row.created_at,
      serviceOrderId: row.service_order_id,
      thumbUrl: null,
      fileUrl: null,
    })),
    ...(petRows.data ?? []).map((row) => ({
      id: row.id,
      source: "pet" as const,
      fileName: row.file_name,
      mimeType: row.mime_type,
      category: row.category,
      phase: null,
      description: row.description,
      createdAt: row.created_at,
      serviceOrderId: null,
      thumbUrl: null,
      fileUrl: null,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = combined.length;
  const pageItems = combined.slice(from, to + 1);
  const signedUrls = await createSignedStorageUrls(
    companyId,
    pageItems.flatMap((item) => {
      const row =
        item.source === "service_order"
          ? serviceRows.data?.find((entry) => entry.id === item.id)
          : petRows.data?.find((entry) => entry.id === item.id);
      return [row?.file_path, row?.thumb_path];
    }),
  );

  const items = pageItems.map((item) => {
    const row =
      item.source === "service_order"
        ? serviceRows.data?.find((entry) => entry.id === item.id)
        : petRows.data?.find((entry) => entry.id === item.id);

    return {
      ...item,
      thumbUrl: row?.thumb_path ? (signedUrls.get(row.thumb_path) ?? null) : null,
      fileUrl: row?.file_path ? (signedUrls.get(row.file_path) ?? null) : null,
    };
  });

  const paginated = buildPaginatedResult(items, total, safePage, GALLERY_PAGE_SIZE);

  return {
    items: paginated.data,
    page: paginated.page,
    pageSize: paginated.pageSize,
    hasMore: paginated.page < paginated.totalPages,
    total: paginated.total,
  };
}

export async function getPetPhotoThumbMap(
  companyId: string,
  pets: Array<{ id: string; photo_thumb_path: string | null }>,
): Promise<Map<string, string | null>> {
  noStore();
  const signedUrls = await createSignedStorageUrls(
    companyId,
    pets.map((pet) => pet.photo_thumb_path),
  );

  return new Map(
    pets.map((pet) => [
      pet.id,
      pet.photo_thumb_path ? (signedUrls.get(pet.photo_thumb_path) ?? null) : null,
    ]),
  );
}

export async function requirePetAttachmentById(companyId: string, attachmentId: string) {
  if (!isValidUuid(attachmentId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("pet_attachments")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", attachmentId)
    .is("archived_at", null)
    .maybeSingle();

  return data as PetAttachmentRecord | null;
}

export async function requireServiceOrderAttachmentById(
  companyId: string,
  attachmentId: string,
) {
  if (!isValidUuid(attachmentId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("service_order_attachments")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", attachmentId)
    .is("archived_at", null)
    .maybeSingle();

  return data as ServiceOrderAttachmentRecord | null;
}
