import { describe, expect, it } from "vitest";
import {
  computeGameweekFines,
  missedReportFineP,
  buyInPenceFromTotalPot,
  formatGbp,
  GLOAT_FINE_P,
} from "./scoring";

describe("computeGameweekFines", () => {
  it("returns empty for empty input", () => {
    expect(computeGameweekFines([], 50)).toEqual([]);
  });

  it("loser pays 15p per point gap to the winner; only the lowest scorer", () => {
    const scores = [
      { entryId: 1, points: 80 }, // winner
      { entryId: 2, points: 60 },
      { entryId: 3, points: 40 }, // loser, gap 40
    ];
    const result = computeGameweekFines(scores, 55);
    const loser = result.find((r) => r.entryId === 3)!;
    expect(loser.loserFineP).toBe(15 * 40); // 600p = £6.00
    expect(result.find((r) => r.entryId === 1)!.loserFineP).toBe(0);
    expect(result.find((r) => r.entryId === 2)!.loserFineP).toBe(0);
  });

  it("everyone below national avg pays 10p × points-below", () => {
    const scores = [
      { entryId: 1, points: 80 },
      { entryId: 2, points: 50 },
      { entryId: 3, points: 30 },
    ];
    const result = computeGameweekFines(scores, 60);
    expect(result.find((r) => r.entryId === 1)!.belowAvgFineP).toBe(0); // above avg
    expect(result.find((r) => r.entryId === 2)!.belowAvgFineP).toBe(10 * 10); // 10p × 10 = 100p
    expect(result.find((r) => r.entryId === 3)!.belowAvgFineP).toBe(10 * 30); // 300p
  });

  it("loser fine is zero if everyone tied (no gap)", () => {
    const scores = [
      { entryId: 1, points: 50 },
      { entryId: 2, points: 50 },
    ];
    const result = computeGameweekFines(scores, 50);
    expect(result.every((r) => r.loserFineP === 0)).toBe(true);
  });

  it("ties at the bottom: all tied losers pay the full fine (documented behaviour)", () => {
    const scores = [
      { entryId: 1, points: 80 }, // winner
      { entryId: 2, points: 30 }, // tied loser
      { entryId: 3, points: 30 }, // tied loser
    ];
    const result = computeGameweekFines(scores, 60);
    expect(result.find((r) => r.entryId === 2)!.loserFineP).toBe(15 * 50);
    expect(result.find((r) => r.entryId === 3)!.loserFineP).toBe(15 * 50);
  });
});

describe("missedReportFineP", () => {
  it("matches the £10 / £15 / £22.50 / £33.75 progression", () => {
    expect(missedReportFineP(0)).toBe(1000); // £10
    expect(missedReportFineP(1)).toBe(1500); // £15
    expect(missedReportFineP(2)).toBe(2250); // £22.50
    expect(missedReportFineP(3)).toBe(3375); // £33.75
    expect(missedReportFineP(4)).toBe(5063); // £50.625 → round to 5063p (£50.63)
  });
});

describe("buyInPenceFromTotalPot", () => {
  it("computes per-player average for night-out buy-in", () => {
    expect(buyInPenceFromTotalPot(1000, 10)).toBe(100); // £1.00
    expect(buyInPenceFromTotalPot(333, 10)).toBe(33);
    expect(buyInPenceFromTotalPot(0, 10)).toBe(0);
  });

  it("returns 0 if no players (avoid divide-by-zero)", () => {
    expect(buyInPenceFromTotalPot(1000, 0)).toBe(0);
  });
});

describe("formatGbp", () => {
  it("formats whole pounds and pennies", () => {
    expect(formatGbp(0)).toBe("£0.00");
    expect(formatGbp(100)).toBe("£1.00");
    expect(formatGbp(150)).toBe("£1.50");
    expect(formatGbp(2250)).toBe("£22.50");
    expect(formatGbp(3375)).toBe("£33.75");
  });

  it("formats negative amounts", () => {
    expect(formatGbp(-100)).toBe("-£1.00");
  });
});

describe("constants sanity", () => {
  it("GLOAT_FINE_P = £1", () => {
    expect(GLOAT_FINE_P).toBe(100);
  });
});
