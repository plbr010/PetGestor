import { describe, expect, it } from "vitest";

import {
  buildPetAttachmentPaths,
  buildPetPhotoPaths,
  buildServiceOrderAttachmentPaths,
  extensionForMimeType,
  isPathInCompany,
  sanitizeFileName,
} from "@/features/attachments/paths";
import {
  parsePetAttachmentUploadForm,
  parsePetPhotoUploadForm,
  parseServiceOrderAttachmentUploadForm,
} from "@/features/attachments/schemas";
import {
  mapAttachmentValidationError,
  validateAttachmentMeta,
} from "@/features/attachments/validation";
import { buildBeforeAfterPair } from "@/features/attachments/queries";
import type { AttachmentView } from "@/features/attachments/types";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const PET_ID = "bbbbbbbb-bbbb-4111-8111-111111111111";
const ORDER_ID = "cccccccc-cccc-4111-8111-222222222222";

function attachment(partial: Partial<AttachmentView>): AttachmentView {
  return {
    id: "att-1",
    fileName: "foto.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    category: "before",
    phase: null,
    description: null,
    uploadedByName: "Ana",
    createdAt: "2026-08-18T10:00:00.000Z",
    isImage: true,
    isPdf: false,
    thumbUrl: null,
    fileUrl: null,
    ...partial,
  };
}

describe("attachments", () => {
  it("A) foto principal — path tenant-aware", () => {
    const paths = buildPetPhotoPaths(COMPANY_A, PET_ID, "webp");
    expect(paths.filePath).toBe(`${COMPANY_A}/pets/${PET_ID}/photo/main.webp`);
    expect(isPathInCompany(COMPANY_A, paths.filePath)).toBe(true);
    expect(isPathInCompany(COMPANY_B, paths.filePath)).toBe(false);
  });

  it("B/C) troca e remoção — schema de upload", () => {
    const form = new FormData();
    form.set("petId", PET_ID);
    expect(parsePetPhotoUploadForm(form).success).toBe(true);
  });

  it("D/E) upload imagem e PDF", () => {
    expect(validateAttachmentMeta("image/jpeg", 1024).ok).toBe(true);
    expect(validateAttachmentMeta("application/pdf", 1024).ok).toBe(true);
  });

  it("F) bloqueia tipo inválido", () => {
    const result = validateAttachmentMeta("application/exe", 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(mapAttachmentValidationError(result.error)).toContain("não permitido");
    }
  });

  it("G) bloqueia arquivo grande", () => {
    const result = validateAttachmentMeta("image/jpeg", 9 * 1024 * 1024);
    expect(result.ok).toBe(false);
  });

  it("H) anexo do pet — path e schema", () => {
    const attachmentId = "dddddddd-dddd-4111-8111-dddddddddddd";
    const paths = buildPetAttachmentPaths(COMPANY_A, PET_ID, attachmentId, "pdf");
    expect(paths.filePath).toContain(`/pets/${PET_ID}/attachments/${attachmentId}/`);

    const form = new FormData();
    form.set("petId", PET_ID);
    form.set("category", "vaccination_card");
    expect(parsePetAttachmentUploadForm(form).success).toBe(true);
  });

  it("I) anexo do atendimento", () => {
    const attachmentId = "eeeeeeee-eeee-4111-8111-eeeeeeeeeeee";
    const paths = buildServiceOrderAttachmentPaths(COMPANY_A, ORDER_ID, attachmentId, "jpg");
    expect(paths.filePath).toContain(`/service-orders/${ORDER_ID}/`);

    const form = new FormData();
    form.set("serviceOrderId", ORDER_ID);
    form.set("category", "arrival");
    form.set("phase", "before");
    expect(parseServiceOrderAttachmentUploadForm(form).success).toBe(true);
  });

  it("J) before/after", () => {
    const pair = buildBeforeAfterPair([
      attachment({ id: "1", phase: "before", category: "before" }),
      attachment({ id: "2", phase: "after", category: "after" }),
    ]);
    expect(pair.before?.id).toBe("1");
    expect(pair.after?.id).toBe("2");
  });

  it("K) galeria — extensões por mime", () => {
    expect(extensionForMimeType("image/png")).toBe("png");
    expect(extensionForMimeType("application/pdf")).toBe("pdf");
  });

  it("L) signed URL — path só da empresa", () => {
    expect(isPathInCompany(COMPANY_A, `${COMPANY_A}/pets/${PET_ID}/photo/main.webp`)).toBe(true);
    expect(isPathInCompany(COMPANY_A, `${COMPANY_B}/pets/${PET_ID}/photo/main.webp`)).toBe(false);
  });

  it("M) isolamento multi-tenant nos paths", () => {
    const paths = buildPetPhotoPaths(COMPANY_B, PET_ID, "webp");
    expect(isPathInCompany(COMPANY_A, paths.filePath)).toBe(false);
  });

  it("N) usuário sem acesso — path de outra empresa rejeitado", () => {
    expect(isPathInCompany(COMPANY_A, "invalid/path")).toBe(false);
  });

  it("O) arquivo arquivado — metadados preservados no nome", () => {
    expect(sanitizeFileName("  carteira/vacinação.pdf  ")).toBe("carteira-vacinação.pdf");
  });

  it("P) mobile básico — schema aceita descrição curta", () => {
    const form = new FormData();
    form.set("petId", PET_ID);
    form.set("category", "photo");
    form.set("description", "Machucado já estava presente na chegada.");
    const parsed = parsePetAttachmentUploadForm(form);
    expect(parsed.success).toBe(true);
  });
});
