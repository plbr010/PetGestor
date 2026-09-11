import { describe, expect, it } from "vitest";

import {
  declaredMimeAgrees,
  detectFileSignature,
  extensionMatchesMime,
  inspectUploadFile,
} from "@/lib/security/file-signature";

const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde,
]);

const JPEG_1X1 = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
  0x00, 0xff, 0xd9,
]);

const WEBP_HEADER = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

const PDF_HEADER = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function fileFrom(bytes: Uint8Array, name: string, type: string, size = bytes.byteLength) {
  const blob = new Blob([bytes], { type });
  return new File([blob], name, { type });
}

describe("file signatures", () => {
  it("aceita JPEG, PNG e WebP válidos", () => {
    expect(detectFileSignature(JPEG_1X1)).toEqual({ ok: true, mimeType: "image/jpeg" });
    expect(detectFileSignature(PNG_1X1)).toEqual({ ok: true, mimeType: "image/png" });
    expect(detectFileSignature(WEBP_HEADER)).toEqual({ ok: true, mimeType: "image/webp" });
  });

  it("rejeita JPEG com MIME falso e conteúdo inválido", () => {
    const fake = Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03]);
    expect(detectFileSignature(fake).ok).toBe(false);
    expect(declaredMimeAgrees("image/jpeg", "image/png")).toBe(false);
  });

  it("rejeita extensão incoerente e path traversal no nome não vaza para o path", () => {
    expect(extensionMatchesMime("foto.exe", "image/jpeg")).toBe(false);
    expect(extensionMatchesMime("../etc/passwd.jpg", "image/jpeg")).toBe(true);
  });
});

describe("inspectUploadFile", () => {
  it("rejeita arquivo acima do limite sem persistir", async () => {
    const huge = fileFrom(JPEG_1X1, "a.jpg", "image/jpeg", 11 * 1024 * 1024);
    Object.defineProperty(huge, "size", { value: 11 * 1024 * 1024 });
    const result = await inspectUploadFile(huge, { imagesOnly: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_file_size");
    }
  });

  it("rejeita PDF quando imagesOnly", async () => {
    const pdf = fileFrom(PDF_HEADER, "doc.pdf", "application/pdf");
    const result = await inspectUploadFile(pdf, { imagesOnly: true });
    expect(result.ok).toBe(false);
  });

  it("aceita PDF válido como anexo", async () => {
    const pdf = fileFrom(PDF_HEADER, "doc.pdf", "application/pdf");
    const result = await inspectUploadFile(pdf);
    expect(result.ok).toBe(true);
  });
});
