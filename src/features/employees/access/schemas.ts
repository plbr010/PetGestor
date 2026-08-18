import { z } from "zod";

import {
  ASSIGNABLE_ACCESS_PROFILES,
  isAccessProfile,
  isPermission,
  PERMISSIONS,
  type AccessProfile,
  type Permission,
} from "@/lib/auth/permissions";

export const employeeAccessFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3, "Informe um e-mail válido.")
    .max(254, "E-mail muito longo.")
    .email("Informe um e-mail válido."),
  accessProfile: z.enum(
    ASSIGNABLE_ACCESS_PROFILES as unknown as [
      AccessProfile,
      ...AccessProfile[],
    ],
  ),
  ownScheduleOnly: z.boolean(),
  permissions: z.array(z.string()).transform((values, ctx) => {
    const parsed: Permission[] = [];

    for (const value of values) {
      if (!isPermission(value)) {
        ctx.addIssue({
          code: "custom",
          message: "Permissão inválida.",
        });
        return z.NEVER;
      }
      parsed.push(value);
    }

    return parsed;
  }),
});

export type EmployeeAccessFormValues = z.infer<typeof employeeAccessFormSchema>;

export function parseEmployeeAccessForm(formData: FormData) {
  const permissions = formData.getAll("permissions").map(String);
  const profileRaw = formData.get("accessProfile");

  return employeeAccessFormSchema.safeParse({
    email: formData.get("email"),
    accessProfile: typeof profileRaw === "string" ? profileRaw : "",
    ownScheduleOnly: formData.get("ownScheduleOnly") === "on",
    permissions,
  });
}

export function parseEmployeeAccessUpdateForm(formData: FormData) {
  const permissions = formData.getAll("permissions").map(String);
  const profileRaw = formData.get("accessProfile");

  const schema = employeeAccessFormSchema.omit({ email: true }).extend({
    accessProfile: z.enum(
      ASSIGNABLE_ACCESS_PROFILES as unknown as [
        AccessProfile,
        ...AccessProfile[],
      ],
    ),
  });

  return schema.safeParse({
    accessProfile: typeof profileRaw === "string" ? profileRaw : "",
    ownScheduleOnly: formData.get("ownScheduleOnly") === "on",
    permissions,
  });
}

export function isValidAccessProfile(value: string): value is AccessProfile {
  return isAccessProfile(value) && value !== "owner_admin";
}

export const ALL_PERMISSION_VALUES = PERMISSIONS;
