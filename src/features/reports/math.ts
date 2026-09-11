export function safePercent(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 10000) / 100;
}

export function safeDivide(num: number, den: number): number | null {
  if (den === 0) return null;
  return Math.round(num / den);
}
