import type {
  AttachmentPhase,
  PetAttachmentCategory,
  ServiceOrderAttachmentCategory,
} from "@/features/attachments/constants";

export type AttachmentView = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  phase: AttachmentPhase | null;
  description: string | null;
  uploadedByName: string;
  createdAt: string;
  isImage: boolean;
  isPdf: boolean;
  thumbUrl: string | null;
  fileUrl: string | null;
};

export type PetPhotoView = {
  photoUrl: string | null;
  thumbUrl: string | null;
  updatedAt: string | null;
};

export type PetGalleryItem = {
  id: string;
  source: "pet" | "service_order";
  fileName: string;
  mimeType: string;
  category: string;
  phase: AttachmentPhase | null;
  description: string | null;
  createdAt: string;
  serviceOrderId: string | null;
  thumbUrl: string | null;
  fileUrl: string | null;
};

export type BeforeAfterPair = {
  before: AttachmentView | null;
  after: AttachmentView | null;
};

export type PetAttachmentRecord = {
  id: string;
  petId: string;
  filePath: string;
  thumbPath: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: PetAttachmentCategory;
  description: string | null;
  uploadedByName: string;
  createdAt: string;
};

export type ServiceOrderAttachmentRecord = {
  id: string;
  serviceOrderId: string;
  petId: string;
  filePath: string;
  thumbPath: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: ServiceOrderAttachmentCategory;
  phase: AttachmentPhase | null;
  description: string | null;
  uploadedByName: string;
  createdAt: string;
};

export type PetGalleryPage = {
  items: PetGalleryItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number;
};
