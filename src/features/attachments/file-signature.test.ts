import { describe, expect, it } from "vitest";

import {
  detectMimeFromMagicBytes,
  inspectDeclaredAndDetectedMime,
} from "@/features/attachments/file-signature";
import { MAX_IMAGE_BYTES } from "@/features/attachments/constants";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0,
]);
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x34]);
const fake = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

describe("file signatures", () => {
  it("detecta JPEG, PNG, WebP e PDF", () => {
    expect(detectMimeFromMagicBytes(jpeg)).toBe("image/jpeg");
    expect(detectMimeFromMagicBytes(png)).toBe("image/png");
    expect(detectMimeFromMagicBytes(webp)).toBe("image/webp");
    expect(detectMimeFromMagicBytes(pdf)).toBe("application/pdf");
  });

  it("rejeita MIME falso com conteúdo inválido", () => {
    const result = inspectDeclaredAndDetectedMime("image/jpeg", fake, 64);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_file_content");
    }
  });

  it("rejeita extensão/MIME incoerente com magic bytes", () => {
    const result = inspectDeclaredAndDetectedMime("image/png", jpeg, 64);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_file_content");
    }
  });

  it("rejeita arquivo acima do limite sem persistir", () => {
    const result = inspectDeclaredAndDetectedMime(
      "image/jpeg",
      jpeg,
      MAX_IMAGE_BYTES + 1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_file_size");
    }
  });

  it("aceita JPEG/PNG/WebP válidos", () => {
    expect(inspectDeclaredAndDetectedMime("image/jpeg", jpeg, 128).ok).toBe(true);
    expect(inspectDeclaredAndDetectedMime("image/png", png, 128).ok).toBe(true);
    expect(inspectDeclaredAndDetectedMime("image/webp", webp, 128).ok).toBe(true);
  });
});
