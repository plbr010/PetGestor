import { describe, expect, it, vi, beforeEach } from "vitest";

const uploadMock = vi.fn();
const removeMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateEqIdMock = vi.fn();

vi.mock("@/lib/auth/require-permission", () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: "user-1" },
    membership: { company: { id: "11111111-1111-4111-8111-111111111111" } },
  })),
}));

vi.mock("@/features/attachments/storage", () => ({
  uploadToCompanyStorage: (...args: unknown[]) => uploadMock(...args),
  removeFromCompanyStorage: (...args: unknown[]) => removeMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: maybeSingleMock,
            }),
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: updateEqIdMock,
        }),
      }),
    }),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
  0x00, 0xff, 0xd9,
]);

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde,
]);

const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

const COMPANY = "11111111-1111-4111-8111-111111111111";
const PET = "bbbbbbbb-bbbb-4111-8111-111111111111";
const OLD_PHOTO = `${COMPANY}/pets/${PET}/photo/old/main.jpg`;

function imageFile(bytes: Uint8Array, name: string, type: string) {
  return new File([new Blob([bytes], { type })], name, { type });
}

describe("uploadPetPhoto", () => {
  beforeEach(() => {
    vi.resetModules();
    uploadMock.mockReset();
    removeMock.mockReset();
    maybeSingleMock.mockReset();
    updateEqIdMock.mockReset();
    maybeSingleMock.mockResolvedValue({
      data: {
        id: PET,
        photo_storage_path: OLD_PHOTO,
        photo_thumb_path: `${COMPANY}/pets/${PET}/photo/old/thumb.webp`,
      },
      error: null,
    });
    updateEqIdMock.mockResolvedValue({ error: null });
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
  });

  async function run(file: File, thumb?: File) {
    const { uploadPetPhoto } = await import("@/features/attachments/upload-pet-photo");
    const form = new FormData();
    form.set("file", file);
    if (thumb) {
      form.set("thumbFile", thumb);
    }
    return uploadPetPhoto(PET, form);
  }

  it("aceita JPEG válido", async () => {
    const result = await run(imageFile(JPEG, "foto.jpg", "image/jpeg"));
    expect(result.success).toBeTruthy();
    expect(uploadMock).toHaveBeenCalled();
  });

  it("aceita PNG válido", async () => {
    const result = await run(imageFile(PNG, "foto.png", "image/png"));
    expect(result.success).toBeTruthy();
  });

  it("aceita WebP válido", async () => {
    const result = await run(imageFile(WEBP, "foto.webp", "image/webp"));
    expect(result.success).toBeTruthy();
  });

  it("rejeita arquivo acima do limite", async () => {
    const file = imageFile(JPEG, "foto.jpg", "image/jpeg");
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    const result = await run(file);
    expect(result.error).toMatch(/10 MB/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejeita MIME falso", async () => {
    const result = await run(imageFile(PNG, "foto.jpg", "image/jpeg"));
    expect(result.error).toBeTruthy();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejeita extensão falsa", async () => {
    const result = await run(imageFile(JPEG, "foto.exe", "image/jpeg"));
    expect(result.error).toBeTruthy();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejeita conteúdo corrompido mesmo com MIME jpeg", async () => {
    const garbage = Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);
    const result = await run(imageFile(garbage, "foto.jpg", "image/jpeg"));
    expect(result.error).toMatch(/corrompida|não pôde ser processada|não corresponde/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("thumbnail inválida falha sem persistir", async () => {
    const garbage = new File([new Blob([Uint8Array.from([0x00, 0x01])])], "thumb.webp", {
      type: "image/webp",
    });
    const result = await run(imageFile(JPEG, "foto.jpg", "image/jpeg"), garbage);
    expect(result.error).toBeTruthy();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("path traversal no nome não é usado no storage path", async () => {
    const result = await run(imageFile(JPEG, "../../etc/passwd.jpg", "image/jpeg"));
    expect(result.success).toBeTruthy();
    const uploadedPath = String(uploadMock.mock.calls[0]?.[0] ?? "");
    expect(uploadedPath).not.toContain("..");
    expect(uploadedPath).toContain(`${COMPANY}/pets/${PET}/photo/`);
  });

  it("duas fotos com o mesmo filename geram paths distintos", async () => {
    await run(imageFile(JPEG, "foto.jpg", "image/jpeg"));
    await run(imageFile(JPEG, "foto.jpg", "image/jpeg"));
    const first = String(uploadMock.mock.calls[0]?.[0]);
    const second = String(uploadMock.mock.calls[2]?.[0] ?? uploadMock.mock.calls[1]?.[0]);
    expect(first).not.toBe(second);
  });

  it("falha de upload não remove a foto antiga", async () => {
    uploadMock.mockResolvedValueOnce({ error: { name: "StorageError" } });
    const result = await run(imageFile(JPEG, "foto.jpg", "image/jpeg"));
    expect(result.error).toBeTruthy();
    const removed = removeMock.mock.calls.flatMap((call) => call[0] as string[]);
    expect(removed).not.toContain(OLD_PHOTO);
  });

  it("falha de update no banco limpa o novo e preserva a antiga", async () => {
    updateEqIdMock.mockResolvedValue({ error: { message: "db down" } });
    const result = await run(imageFile(JPEG, "foto.jpg", "image/jpeg"));
    expect(result.error).toBeTruthy();
    const removed = removeMock.mock.calls.flatMap((call) => call[0] as string[]);
    expect(removed.some((path) => path.includes("/photo/") && !path.includes("/old/"))).toBe(true);
    expect(removed).not.toContain(OLD_PHOTO);
  });

  it("falha ao apagar a antiga depois do sucesso não esconde o sucesso", async () => {
    removeMock.mockResolvedValue({ error: { name: "StorageError" } });
    const result = await run(imageFile(JPEG, "foto.jpg", "image/jpeg"));
    expect(result.success).toBeTruthy();
  });
});
