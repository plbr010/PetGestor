"use server";

import { revalidatePath } from "next/cache";

import {
  parseEmployeeAccessForm,
  parseEmployeeAccessUpdateForm,
} from "@/features/employees/access/schemas";
import {
  mapSendEmployeeInviteMessage,
  sendEmployeeInviteEmail,
} from "@/features/employees/access/send-invite-email";
import {
  buildPermissionsPayload,
  permissionsToJson,
} from "@/lib/auth/permissions";
import { requirePermission, assertPermissionForAction } from "@/lib/auth/require-permission";
import { GENERIC_NOT_FOUND_MESSAGE } from "@/lib/security/tenant-access";
import { isValidUuid } from "@/lib/security/uuid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EmployeeAccessActionState = {
  error?: string;
  success?: string;
  invitePending?: boolean;
  emailDelivery?: "sent" | "account_exists" | "config_missing" | "send_failed";
  /** Link Auth para compartilhar se o e-mail não chegar. */
  shareLink?: string;
};

function revalidateEmployeeAccess(employeeId: string) {
  revalidatePath("/dashboard/funcionarios");
  revalidatePath(`/dashboard/funcionarios/${employeeId}`);
}

export async function grantEmployeeAccessAction(
  employeeId: string,
  _prevState: EmployeeAccessActionState,
  formData: FormData,
): Promise<EmployeeAccessActionState> {
  if (!isValidUuid(employeeId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("employees.manage");
  const denied = assertPermissionForAction(context, "employees.manage");

  if (denied) {
    return denied;
  }

  const parsed = parseEmployeeAccessForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const permissions = buildPermissionsPayload(
    parsed.data.accessProfile,
    parsed.data.permissions,
  );

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("grant_employee_access", {
    p_employee_id: employeeId,
    p_email: parsed.data.email,
    p_access_profile: parsed.data.accessProfile,
    p_permissions: permissionsToJson(permissions),
    p_own_schedule_only: parsed.data.ownScheduleOnly,
  });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";

    if (message.includes("employee_already_linked")) {
      return {
        error:
          "Este funcionário já está vinculado a outra conta. Remova o acesso atual antes de convidar outro e-mail.",
      };
    }

    if (message.includes("employee_not_found")) {
      return { error: "Funcionário não encontrado ou inativo." };
    }

    if (message.includes("cannot_modify_owner_access")) {
      return { error: "Não é possível alterar o acesso do dono da empresa." };
    }

    return { error: "Não foi possível conceder acesso. Verifique os dados e tente novamente." };
  }

  revalidateEmployeeAccess(employeeId);

  const result = data as { status?: string; email?: string } | null;

  if (result?.status === "invite_pending") {
    const inviteEmail = result.email ?? parsed.data.email;
    const delivery = await sendEmployeeInviteEmail(inviteEmail);

    return {
      success: mapSendEmployeeInviteMessage(delivery, inviteEmail),
      invitePending: true,
      emailDelivery: delivery.status,
      shareLink: delivery.shareLink,
    };
  }

  return {
    success:
      "Acesso ao PetGestor concedido. O funcionário já pode entrar com a conta deste e-mail.",
  };
}

export async function updateEmployeeAccessAction(
  employeeId: string,
  _prevState: EmployeeAccessActionState,
  formData: FormData,
): Promise<EmployeeAccessActionState> {
  if (!isValidUuid(employeeId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("employees.manage");
  const denied = assertPermissionForAction(context, "employees.manage");

  if (denied) {
    return denied;
  }

  const parsed = parseEmployeeAccessUpdateForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const permissions = buildPermissionsPayload(
    parsed.data.accessProfile,
    parsed.data.permissions,
  );

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("update_employee_access", {
    p_employee_id: employeeId,
    p_access_profile: parsed.data.accessProfile,
    p_permissions: permissionsToJson(permissions),
    p_own_schedule_only: parsed.data.ownScheduleOnly,
  });

  if (error) {
    return { error: "Não foi possível atualizar as permissões." };
  }

  revalidateEmployeeAccess(employeeId);

  return { success: "Permissões atualizadas." };
}

export async function revokeEmployeeAccessAction(
  employeeId: string,
): Promise<EmployeeAccessActionState> {
  if (!isValidUuid(employeeId)) {
    return { error: GENERIC_NOT_FOUND_MESSAGE };
  }

  const context = await requirePermission("employees.manage");
  const denied = assertPermissionForAction(context, "employees.manage");

  if (denied) {
    return denied;
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("revoke_employee_access", {
    p_employee_id: employeeId,
  });

  if (error) {
    return { error: "Não foi possível remover o acesso." };
  }

  revalidateEmployeeAccess(employeeId);

  return { success: "Acesso ao sistema removido. O histórico do funcionário foi preservado." };
}
