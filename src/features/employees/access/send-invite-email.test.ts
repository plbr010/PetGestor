import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  isAlreadyRegisteredAuthError,
  mapSendEmployeeInviteMessage,
} from "@/features/employees/access/send-invite-email";

describe("isAlreadyRegisteredAuthError", () => {
  it("detecta mensagens comuns do Supabase Auth", () => {
    expect(isAlreadyRegisteredAuthError("User already registered")).toBe(true);
    expect(isAlreadyRegisteredAuthError("A user with this email address has already been registered")).toBe(
      true,
    );
    expect(isAlreadyRegisteredAuthError("email_exists")).toBe(true);
    expect(isAlreadyRegisteredAuthError("rate limit exceeded")).toBe(false);
  });
});

describe("mapSendEmployeeInviteMessage", () => {
  it("não afirma envio quando falhou ou falta config", () => {
    expect(mapSendEmployeeInviteMessage({ status: "sent" }, "a@b.com")).toMatch(/e-mail enviado/i);
    expect(mapSendEmployeeInviteMessage({ status: "config_missing" }, "a@b.com")).toMatch(
      /não está configurado/i,
    );
    expect(mapSendEmployeeInviteMessage({ status: "send_failed" }, "a@b.com")).toMatch(
      /não foi possível enviar/i,
    );
    expect(mapSendEmployeeInviteMessage({ status: "account_exists" }, "a@b.com")).toMatch(
      /já tem conta/i,
    );
  });
});

const inviteUserByEmailMock = vi.fn();
const generateLinkMock = vi.fn();
const deleteUserMock = vi.fn();
const getSiteUrlMock = vi.fn();
const isConfiguredMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: (...args: unknown[]) => inviteUserByEmailMock(...args),
        generateLink: (...args: unknown[]) => generateLinkMock(...args),
        deleteUser: (...args: unknown[]) => deleteUserMock(...args),
      },
    },
  }),
}));

vi.mock("@/lib/auth/get-site-url", () => ({
  getSiteUrl: (...args: unknown[]) => getSiteUrlMock(...args),
}));

vi.mock("@/lib/env/server-env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env/server-env")>();
  return {
    ...actual,
    isSupabaseServiceRoleConfigured: (...args: unknown[]) => isConfiguredMock(...args),
  };
});

describe("sendEmployeeInviteEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    inviteUserByEmailMock.mockReset();
    generateLinkMock.mockReset();
    deleteUserMock.mockReset();
    getSiteUrlMock.mockReset();
    isConfiguredMock.mockReset();
    getSiteUrlMock.mockResolvedValue("https://app.example.com");
    isConfiguredMock.mockReturnValue(true);
  });

  it("retorna config_missing sem service role", async () => {
    isConfiguredMock.mockReturnValue(false);
    const { sendEmployeeInviteEmail } = await import(
      "@/features/employees/access/send-invite-email"
    );
    await expect(sendEmployeeInviteEmail("func@email.com")).resolves.toEqual({
      status: "config_missing",
    });
    expect(inviteUserByEmailMock).not.toHaveBeenCalled();
  });

  it("envia convite Auth com redirect para /convite", async () => {
    inviteUserByEmailMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { sendEmployeeInviteEmail } = await import(
      "@/features/employees/access/send-invite-email"
    );

    await expect(sendEmployeeInviteEmail("func@email.com")).resolves.toEqual({ status: "sent" });
    expect(inviteUserByEmailMock).toHaveBeenCalledWith(
      "func@email.com",
      expect.objectContaining({
        redirectTo: "https://app.example.com/auth/confirm?next=%2Fconvite",
      }),
    );
  });

  it("reenvia apagando usuário Auth ainda não confirmado", async () => {
    inviteUserByEmailMock
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: "User already registered" },
      })
      .mockResolvedValueOnce({ data: { user: { id: "u2" } }, error: null });
    generateLinkMock.mockResolvedValue({
      data: { user: { id: "u1", email_confirmed_at: null } },
      error: null,
    });
    deleteUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const { sendEmployeeInviteEmail } = await import(
      "@/features/employees/access/send-invite-email"
    );

    await expect(sendEmployeeInviteEmail("func@email.com")).resolves.toEqual({ status: "sent" });
    expect(deleteUserMock).toHaveBeenCalledWith("u1");
    expect(inviteUserByEmailMock).toHaveBeenCalledTimes(2);
  });

  it("retorna account_exists quando a conta Auth já está confirmada", async () => {
    inviteUserByEmailMock.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    });
    generateLinkMock.mockResolvedValue({
      data: { user: { id: "u1", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    });

    const { sendEmployeeInviteEmail } = await import(
      "@/features/employees/access/send-invite-email"
    );

    await expect(sendEmployeeInviteEmail("func@email.com")).resolves.toEqual({
      status: "account_exists",
    });
    expect(deleteUserMock).not.toHaveBeenCalled();
  });
});
