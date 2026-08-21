import { describe, expect, it } from "vitest";

import {
  loginSchema,
  newPasswordSchema,
  onboardingSchema,
  passwordRecoverySchema,
  signUpSchema,
  staffSignUpSchema,
} from "@/features/auth/schemas";

const validPhone = "(32) 99999-9999";

describe("signUpSchema", () => {
  it("aceita cadastro válido com telefone", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      phone: validPhone,
      email: "ANA@EXAMPLE.COM",
      password: "senha1234",
      confirmPassword: "senha1234",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ana@example.com");
      expect(result.data.fullName).toBe("Ana Silva");
      expect(result.data.phone).toBe("+5532999999999");
    }
  });

  it("rejeita cadastro sem telefone", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      phone: "",
      email: "ana@example.com",
      password: "senha1234",
      confirmPassword: "senha1234",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita telefone inválido", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      phone: "123",
      email: "ana@example.com",
      password: "senha1234",
      confirmPassword: "senha1234",
    });

    expect(result.success).toBe(false);
  });

  it("normaliza telefone para E.164", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      phone: "32 99999-9999",
      email: "ana@example.com",
      password: "senha1234",
      confirmPassword: "senha1234",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+5532999999999");
    }
  });

  it("rejeita senhas diferentes", () => {
    const result = signUpSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      phone: validPhone,
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
      phone: validPhone,
      email: "ana@example.com",
      password: "1234567",
      confirmPassword: "1234567",
    });

    expect(result.success).toBe(false);
  });
});

describe("staffSignUpSchema", () => {
  it("aceita cadastro de funcionário sem empresa", () => {
    const result = staffSignUpSchema.safeParse({
      fullName: "João Funcionário",
      email: "JOAO@EXAMPLE.COM",
      password: "senha1234",
      confirmPassword: "senha1234",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("joao@example.com");
    }
  });

  it("não exige companyName nem telefone", () => {
    const result = staffSignUpSchema.safeParse({
      fullName: "João",
      email: "joao@example.com",
      password: "senha1234",
      confirmPassword: "senha1234",
      companyName: undefined,
    });

    expect(result.success).toBe(true);
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
  it("aceita onboarding válido com telefone normalizado", () => {
    const result = onboardingSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      phone: validPhone,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+5532999999999");
    }
  });

  it("rejeita onboarding sem telefone", () => {
    const result = onboardingSchema.safeParse({
      fullName: "Ana Silva",
      companyName: "Pet Shop Amigo",
      phone: "",
    });

    expect(result.success).toBe(false);
  });
});
