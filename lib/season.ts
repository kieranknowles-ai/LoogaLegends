// The one line to change when a new FPL season starts (mid-August).
// Everything else — sync, standings, fines, the season toggle — reads off this.
export const CURRENT_SEASON = "2026-27";

/** "2026-27" -> "2025-26". Used only for the migration backfill comment; not called at runtime. */
export function previousSeason(season: string): string {
  const [start] = season.split("-").map(Number);
  const prevStart = start - 1;
  const prevEndSuffix = String(start).slice(-2);
  return `${prevStart}-${prevEndSuffix}`;
}
