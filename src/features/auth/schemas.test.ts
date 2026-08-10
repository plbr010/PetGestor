import { describe, expect, it } from "vitest";

import {
  loginSchema,
  newPasswordSchema,
  onboardingSchema,
  passwordRecoverySchema,
  signUpSchema,
} from "@/features/auth/schemas";

describe("signUpSchema", () => {
  it("aceita cadastro válido", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      email: "ANA@EXAMPLE.COM",
      password: "senha1234",
      confirmPassword: "senha1234",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ana@example.com");
      expect(result.data.fullName).toBe("Ana Silva");
    }
  });

  it("rejeita senhas diferentes", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      email: "ana@example.com",
      password: "senha1234",
      confirmPassword: "outrasenha",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita senha curta", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      email: "ana@example.com",
      password: "1234567",
      confirmPassword: "1234567",
    });

    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("aceita login válido", () => {
    const result = loginSchema.safeParse({
      email: "usuario@example.com",
      password: "senha1234",
    });

    expect(result.success).toBe(true);
  });
});

describe("passwordRecoverySchema", () => {
  it("aceita e-mail válido", () => {
    const result = passwordRecoverySchema.safeParse({
      email: "usuario@example.com",
    });

    expect(result.success).toBe(true);
  });
});

describe("newPasswordSchema", () => {
  it("aceita nova senha válida", () => {
    const result = newPasswordSchema.safeParse({
      password: "novasenha1",
      confirmPassword: "novasenha1",
    });

    expect(result.success).toBe(true);
  });

  it("rejeita confirmação divergente", () => {
    const result = newPasswordSchema.safeParse({
      password: "novasenha1",
      confirmPassword: "diferente1",
    });

    expect(result.success).toBe(false);
  });
});

describe("onboardingSchema", () => {
  it("aceita onboarding válido", () => {
    const result = onboardingSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
    });

    expect(result.success).toBe(true);
  });
});
