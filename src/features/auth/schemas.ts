import { z } from "zod";

const emailField = z
  .string({ error: "Informe seu e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe seu e-mail.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email("Informe um e-mail válido."));

const passwordField = z
  .string({ error: "Informe sua senha." })
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(128, "Senha muito longa.");

const personNameField = z
  .string({ error: "Informe seu nome." })
  .trim()
  .min(2, "O nome deve ter pelo menos 2 caracteres.")
  .max(120, "Nome muito longo.");

const companyNameField = z
  .string({ error: "Informe o nome do pet shop." })
  .trim()
  .min(2, "O nome do pet shop deve ter pelo menos 2 caracteres.")
  .max(120, "Nome do pet shop muito longo.");

export const signUpSchema = z
  .object({
    fullName: personNameField,
    companyName: companyNameField,
    email: emailField,
    password: passwordField,
    confirmPassword: z.string({ error: "Confirme sua senha." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ error: "Informe sua senha." })
    .min(1, "Informe sua senha.")
    .max(128, "Senha muito longa."),
});

export const passwordRecoverySchema = z.object({
  email: emailField,
});

export const newPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string({ error: "Confirme a nova senha." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export const onboardingSchema = z.object({
  fullName: personNameField,
  companyName: companyNameField,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordRecoveryInput = z.infer<typeof passwordRecoverySchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
