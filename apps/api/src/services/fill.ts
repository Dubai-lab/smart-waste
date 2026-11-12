/** Distance from the probe → fill %, 0 at empty_cm, 100 at full_cm, rounded to 0.1. */
export function fillPercent(distanceCm: number, emptyCm: number, fullCm: number): number {
  const pct = ((emptyCm - distanceCm) / (emptyCm - fullCm)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}
