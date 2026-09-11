import { describe, expect, it } from "vitest";

import { maskEmail, redactLogDetails } from "@/lib/security/safe-log";

describe("safe-log", () => {
  it("mascara e-mail", () => {
    expect(maskEmail("ana@example.com")).toBe("a***@example.com");
  });

  it("não deixa token, senha ou magic link no payload", () => {
    const redacted = redactLogDetails({
      password: "secret",
      access_token: "jwt",
      refresh_token: "r",
      magic_link: "https://xxx",
      token_hash: "abc",
      code: "pkce",
      email: "ana@example.com",
      status: 500,
    });

    expect(redacted.password).toBe("[redacted]");
    expect(redacted.access_token).toBe("[redacted]");
    expect(redacted.refresh_token).toBe("[redacted]");
    expect(redacted.magic_link).toBe("[redacted]");
    expect(redacted.token_hash).toBe("[redacted]");
    expect(redacted.code).toBe("[redacted]");
    expect(redacted.email).toBe("a***@example.com");
    expect(redacted.status).toBe(500);
  });
});
