import { describe, expect, it } from "vitest";

import {
  classifyProviderError,
  isTransientProviderFailure,
  userMessageForProviderError,
} from "@/features/subscription/provider-errors";

describe("classifyProviderError", () => {
  it("timeout não é pagamento rejeitado", () => {
    expect(classifyProviderError({ name: "AbortError" })).toBe("timeout");
    expect(isTransientProviderFailure("timeout")).toBe(true);
    expect(userMessageForProviderError("timeout")).toMatch(/demorou/i);
    expect(userMessageForProviderError("timeout")).not.toMatch(/rejeit/i);
  });

  it("500 é instabilidade, não rejected", () => {
    expect(classifyProviderError({ status: 500, message: "mercado_pago_request_failed" })).toBe(
      "server_error",
    );
    expect(isTransientProviderFailure("server_error")).toBe(true);
  });

  it("429 é rate limit", () => {
    expect(classifyProviderError({ status: 429 })).toBe("rate_limited");
  });

  it("401/403 é credencial inválida", () => {
    expect(classifyProviderError({ status: 401 })).toBe("invalid_credentials");
    expect(userMessageForProviderError("invalid_credentials")).not.toMatch(/token/i);
  });

  it("pagamento rejeitado é distinto de falha de rede", () => {
    expect(classifyProviderError({ message: "payment_rejected" })).toBe("rejected_payment");
    expect(isTransientProviderFailure("rejected_payment")).toBe(false);
  });
});
