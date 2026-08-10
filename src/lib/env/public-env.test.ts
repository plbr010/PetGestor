import { describe, expect, it } from "vitest";

import {
  PublicEnvError,
  hasPublicEnv,
  parsePublicEnv,
} from "@/lib/env/public-env";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example_key",
};

describe("public env validation", () => {
  it("aceita variáveis públicas válidas do Supabase", () => {
    expect(parsePublicEnv(validEnv)).toEqual(validEnv);
    expect(hasPublicEnv(validEnv)).toBe(true);
  });

  it("rejeita URL ausente com mensagem clara", () => {
    expect(() =>
      parsePublicEnv({
        ...validEnv,
        NEXT_PUBLIC_SUPABASE_URL: "",
      }),
    ).toThrow(PublicEnvError);

    expect(() =>
      parsePublicEnv({
        ...validEnv,
        NEXT_PUBLIC_SUPABASE_URL: "",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/i);
  });

  it("rejeita publishable key ausente com mensagem clara", () => {
    expect(() =>
      parsePublicEnv({
        ...validEnv,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow(PublicEnvError);

    expect(() =>
      parsePublicEnv({
        ...validEnv,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/i);
  });

  it("rejeita URL inválida", () => {
    expect(() =>
      parsePublicEnv({
        ...validEnv,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      }),
    ).toThrow(/URL válida/i);
  });

  it("detecta configuração incompleta via hasPublicEnv", () => {
    expect(hasPublicEnv({})).toBe(false);
    expect(
      hasPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      }),
    ).toBe(false);
  });
});
