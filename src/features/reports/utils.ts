export function changePercent(
  current: number,
  prev: number | null | undefined,
): number | null {
  if (prev == null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}
