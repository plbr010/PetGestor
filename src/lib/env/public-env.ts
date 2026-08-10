import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({
      error: "NEXT_PUBLIC_SUPABASE_URL é obrigatória.",
    })
    .trim()
    .min(1, "NEXT_PUBLIC_SUPABASE_URL é obrigatória.")
    .url("NEXT_PUBLIC_SUPABASE_URL deve ser uma URL válida."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({
      error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY é obrigatória.",
    })
    .trim()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY é obrigatória."),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export class PublicEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicEnvError";
  }
}

function readPublicEnvSource(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function parsePublicEnv(
  source: Record<string, string | undefined> = readPublicEnvSource(),
): PublicEnv {
  const result = publicEnvSchema.safeParse(source);

  if (!result.success) {
    const firstIssue = result.error.issues[0]?.message;
    throw new PublicEnvError(
      firstIssue ??
        "Configuração do Supabase incompleta. Verifique o arquivo .env.local.",
    );
  }

  return result.data;
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv();
}

export function hasPublicEnv(
  source: Record<string, string | undefined> = readPublicEnvSource(),
): boolean {
  return publicEnvSchema.safeParse(source).success;
}
