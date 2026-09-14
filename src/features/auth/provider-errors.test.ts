import { describe, expect, it } from "vitest";

import {
  isAntiEnumerationAuthError,
  isAuthOutageError,
} from "@/features/auth/provider-errors";

describe("auth provider error classification", () => {
  it("trata user-not-found / e-mail inválido como anti-enumeração", () => {
    expect(isAntiEnumerationAuthError({ status: 404, code: "user_not_found" })).toBe(true);
    expect(
      isAntiEnumerationAuthError({
        status: 400,
        code: "email_address_invalid",
        message: "Unable to validate email address: invalid",
      }),
    ).toBe(true);
    expect(
      isAntiEnumerationAuthError({
        status: 422,
        code: "validation_failed",
        message: "Unable to validate email address: invalid",
      }),
    ).toBe(true);
    expect(
      isAntiEnumerationAuthError({
        status: 400,
        message: "User not found",
      }),
    ).toBe(true);
  });

  it("não trata pane SMTP / 5xx / rate limit do provider como anti-enumeração", () => {
    expect(
      isAntiEnumerationAuthError({
        status: 500,
        code: "unexpected_failure",
        message: "smtp down",
      }),
    ).toBe(false);
    expect(isAuthOutageError({ status: 500, code: "unexpected_failure" })).toBe(true);
    expect(
      isAntiEnumerationAuthError({
        status: 429,
        code: "over_email_send_rate_limit",
      }),
    ).toBe(false);
  });

  it("não trata redirect URL fora da allowlist como anti-enumeração", () => {
    expect(
      isAntiEnumerationAuthError({
        status: 400,
        message: "Redirect URL not allowed",
      }),
    ).toBe(false);
  });
});
