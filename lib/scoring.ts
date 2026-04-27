// Pure functions for fine calculations. All money in pence.

export const GLOAT_FINE_P = 100; // £1
export const MISSED_REPORT_BASE_P = 1000; // £10
export const MISSED_REPORT_MULTIPLIER = 1.5;
export const LOSER_FINE_PER_POINT_P = 15; // 15p per point gap
export const BELOW_AVG_FINE_PER_POINT_P = 10; // 10p per point under average

export type GwScore = { entryId: number; points: number };

export type GwBreakdown = {
  entryId: number;
  points: number;
  loserFineP: number;
  belowAvgFineP: number;
};

/** Compute weekly fines for every entry in the league for a single GW. */
export function computeGameweekFines(
  scores: GwScore[],
  nationalAverage: number,
): GwBreakdown[] {
  if (scores.length === 0) return [];
  const winnerPts = Math.max(...scores.map((s) => s.points));
  const loserPts = Math.min(...scores.map((s) => s.points));
  const loserGap = winnerPts - loserPts;

  // Identify the single loser. If multiple tie at the bottom, they all share the fine —
  // but that's a rule call the user hasn't made, so default to "everyone tied at the bottom pays in full".
  const losers = new Set(scores.filter((s) => s.points === loserPts).map((s) => s.entryId));

  return scores.map((s) => {
    const loserFineP = losers.has(s.entryId) && loserGap > 0 ? LOSER_FINE_PER_POINT_P * loserGap : 0;
    const belowAvgGap = nationalAverage - s.points;
    const belowAvgFineP = belowAvgGap > 0 ? BELOW_AVG_FINE_PER_POINT_P * belowAvgGap : 0;
    return {
      entryId: s.entryId,
      points: s.points,
      loserFineP,
      belowAvgFineP,
    };
  });
}

/** Missed-report fine, given how many prior missed reports the player has *applied* this season. */
export function missedReportFineP(priorMissed: number): number {
  // £10, £15, £22.50, £33.75, £50.625 → round to nearest pence
  return Math.round(MISSED_REPORT_BASE_P * Math.pow(MISSED_REPORT_MULTIPLIER, priorMissed));
}

/** Total night-out buy-in for non-playing attendees: average pot owed across all players. */
export function buyInPenceFromTotalPot(totalPotP: number, playerCount: number): number {
  if (playerCount <= 0) return 0;
  return Math.round(totalPotP / playerCount);
}

/** Format pence as £-prefixed string. */
export function formatGbp(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}£${pounds}.${remainder.toString().padStart(2, "0")}`;
}
