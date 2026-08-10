import { createHmac, timingSafeEqual } from "node:crypto";

export function normalizeWebhookDataId(dataId: string | null | undefined): string | undefined {
  if (!dataId) {
    return undefined;
  }

  return /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
}

export function buildWebhookManifest(params: {
  dataId?: string;
  xRequestId?: string;
  ts?: string;
}): string {
  const parts: string[] = [];

  if (params.dataId) {
    parts.push(`id:${params.dataId}`);
  }

  if (params.xRequestId) {
    parts.push(`request-id:${params.xRequestId}`);
  }

  if (params.ts) {
    parts.push(`ts:${params.ts}`);
  }

  return parts.length > 0 ? `${parts.join(";")};` : "";
}

export function parseMercadoPagoSignatureHeader(header: string | null | undefined) {
  if (!header) {
    return null;
  }

  const parts = Object.fromEntries(
    header.split(",").map((segment) => {
      const [key, ...valueParts] = segment.trim().split("=");
      return [key, valueParts.join("=")];
    }),
  );

  if (!parts.ts || !parts.v1) {
    return null;
  }

  return { ts: parts.ts, v1: parts.v1 };
}

export function verifyMercadoPagoWebhookSignature(params: {
  xSignature: string | null | undefined;
  xRequestId: string | null | undefined;
  dataId: string | null | undefined;
  secret: string;
}): boolean {
  const parsed = parseMercadoPagoSignatureHeader(params.xSignature);
  if (!parsed) {
    return false;
  }

  const normalizedDataId = normalizeWebhookDataId(params.dataId);
  const manifest = buildWebhookManifest({
    dataId: normalizedDataId,
    xRequestId: params.xRequestId ?? undefined,
    ts: parsed.ts,
  });

  const expected = createHmac("sha256", params.secret).update(manifest).digest("hex");
  const received = Buffer.from(parsed.v1, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (received.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(received, expectedBuffer);
}
