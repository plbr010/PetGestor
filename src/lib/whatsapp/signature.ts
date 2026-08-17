import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsAppWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}): boolean {
  if (!input.signatureHeader || !input.appSecret) {
    return false;
  }

  const prefix = "sha256=";
  if (!input.signatureHeader.startsWith(prefix)) {
    return false;
  }

  const expected = createHmac("sha256", input.appSecret)
    .update(input.rawBody, "utf8")
    .digest("hex");
  const received = input.signatureHeader.slice(prefix.length);

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isValidWebhookVerifyRequest(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  expectedToken: string;
}): input is { mode: string; token: string; challenge: string; expectedToken: string } {
  return (
    input.mode === "subscribe" &&
    typeof input.token === "string" &&
    input.token.length > 0 &&
    typeof input.challenge === "string" &&
    input.challenge.length > 0 &&
    input.expectedToken.length > 0 &&
    secureEqual(input.token, input.expectedToken)
  );
}
