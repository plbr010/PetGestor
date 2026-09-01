import { describe, expect, it } from "vitest";

import {
  isDemoCompanyName,
  isDemoOwnerEmail,
  normalizeDemoCompanyName,
} from "@/config/demo-accounts";

describe("demo account identification", () => {
  it("normaliza nomes de empresa para comparação", () => {
    expect(normalizeDemoCompanyName("  Pet Shop Amigo Fiel  ")).toBe("pet shop amigo fiel");
  });

  it("identifica nome demonstrativo do marketing", () => {
    expect(isDemoCompanyName("Pet Shop Amigo Fiel")).toBe(true);
    expect(isDemoCompanyName("pet shop amigo fiel")).toBe(true);
    expect(isDemoCompanyName("Pet Shop Real")).toBe(false);
  });

  it("identifica e-mails típicos de contas de teste", () => {
    expect(isDemoOwnerEmail("mariana+demo@example.com")).toBe(true);
    expect(isDemoOwnerEmail("user@demo.petgestor.com")).toBe(true);
    expect(isDemoOwnerEmail("cursoragent@cursor.com")).toBe(true);
    expect(isDemoOwnerEmail("plbrpc@gmail.com")).toBe(false);
  });
});
