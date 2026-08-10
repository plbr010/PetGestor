import { describe, expect, it } from "vitest";

import { petFormSchema } from "@/features/pets/schemas";

describe("petFormSchema", () => {
  it("aceita pet válido", () => {
    const result = petFormSchema.safeParse({
      name: "Thor",
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      species: "dog",
      breed: "SRD",
      sex: "male",
      birthDate: "2020-05-10",
      weightKg: "12.5",
      color: "Caramelo",
      allergies: "",
      notes: "",
    });

    expect(result.success).toBe(true);
  });

  it("rejeita data futura", () => {
    const result = petFormSchema.safeParse({
      name: "Thor",
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      species: "dog",
      breed: "",
      sex: "unknown",
      birthDate: "2099-01-01",
      weightKg: "",
      color: "",
      allergies: "",
      notes: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita peso inválido", () => {
    const result = petFormSchema.safeParse({
      name: "Thor",
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      species: "cat",
      breed: "",
      sex: "unknown",
      birthDate: "",
      weightKg: "0",
      color: "",
      allergies: "",
      notes: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita espécie inválida", () => {
    const result = petFormSchema.safeParse({
      name: "Thor",
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      species: "bird",
      breed: "",
      sex: "unknown",
      birthDate: "",
      weightKg: "",
      color: "",
      allergies: "",
      notes: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita sexo inválido", () => {
    const result = petFormSchema.safeParse({
      name: "Thor",
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      species: "dog",
      breed: "",
      sex: "invalid",
      birthDate: "",
      weightKg: "",
      color: "",
      allergies: "",
      notes: "",
    });

    expect(result.success).toBe(false);
  });
});
