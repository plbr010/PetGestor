export const ATTACHMENTS_BUCKET = "company-files" as const;

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedAttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const PET_ATTACHMENT_CATEGORIES = [
  "vaccination_card",
  "document",
  "photo",
  "report",
  "other",
] as const;

export type PetAttachmentCategory = (typeof PET_ATTACHMENT_CATEGORIES)[number];

export const SERVICE_ORDER_ATTACHMENT_CATEGORIES = [
  "arrival",
  "before",
  "after",
  "observation",
  "other",
] as const;

export type ServiceOrderAttachmentCategory =
  (typeof SERVICE_ORDER_ATTACHMENT_CATEGORIES)[number];

export const ATTACHMENT_PHASES = ["before", "after"] as const;
export type AttachmentPhase = (typeof ATTACHMENT_PHASES)[number];

export const PET_ATTACHMENT_CATEGORY_LABELS: Record<PetAttachmentCategory, string> = {
  vaccination_card: "Carteira de vacinação",
  document: "Comprovante/documento",
  photo: "Foto",
  report: "Laudo",
  other: "Outro",
};

export const SERVICE_ORDER_ATTACHMENT_CATEGORY_LABELS: Record<
  ServiceOrderAttachmentCategory,
  string
> = {
  arrival: "Chegada",
  before: "Antes",
  after: "Depois",
  observation: "Observação",
  other: "Outro",
};

export const ATTACHMENT_PHASE_LABELS: Record<AttachmentPhase, string> = {
  before: "Antes",
  after: "Depois",
};

export const GALLERY_PAGE_SIZE = 12;
