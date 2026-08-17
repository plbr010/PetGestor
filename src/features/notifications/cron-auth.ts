import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  cronSecret: string | undefined,
): boolean {
  if (!cronSecret || !authorizationHeader) {
    return false;
  }

  const expected = `Bearer ${cronSecret}`;
  const receivedBuffer = Buffer.from(authorizationHeader);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}
