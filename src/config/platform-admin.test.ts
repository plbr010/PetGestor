import { describe, expect, it } from "vitest";

import {
  isAllowlistedPlatformAdminEmail,
  PLATFORM_ADMIN_EMAILS,
} from "@/config/platform-admin";

describe("platform admin allowlist", () => {
  it("libera somente plbrpc@gmail.com", () => {
    expect(PLATFORM_ADMIN_EMAILS).toEqual(["plbrpc@gmail.com"]);
    expect(isAllowlistedPlatformAdminEmail("plbrpc@gmail.com")).toBe(true);
    expect(isAllowlistedPlatformAdminEmail("PLBRPC@GMAIL.COM")).toBe(true);
    expect(isAllowlistedPlatformAdminEmail("cliente@example.com")).toBe(false);
    expect(isAllowlistedPlatformAdminEmail(null)).toBe(false);
  });
});
