import { describe, expect, it } from "vitest";

import { customerFormSchema } from "@/features/customers/schemas";

describe("customerFormSchema", () => {
  it("aceita tutor válido", () => {
    const result = customerFormSchema.safeParse({
      name: "Ana Silva",
      phone: "(32) 99999-9999",
      email: "ana@example.com",
      notes: "Cliente VIP",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("32999999999");
      expect(result.data.email).toBe("ana@example.com");
    }
  });

  it("rejeita telefone inválido", () => {
    const result = customerFormSchema.safeParse({
      name: "Ana Silva",
      phone: "123",
      email: "",
      notes: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita e-mail inválido", () => {
    const result = customerFormSchema.safeParse({
      name: "Ana Silva",
      phone: "(32) 99999-9999",
      email: "email-invalido",
      notes: "",
    });

    expect(result.success).toBe(false);
  });
});
