import { describe, expect, it } from "vitest";

import {
  CYCLE_LENGTH_DAYS,
  DEFAULT_BILLING_CYCLE_DAY,
  calculateMeterMetrics,
  clampCycleDay,
  getCycleEndDate,
  getCycleStartDate,
  getStatusZone,
} from "@/lib/burn-rate";

/** Local-midnight date, mirroring the engine's local-time semantics. */
const D = (iso: string) => new Date(`${iso}T00:00:00`);

const run = (o: {
  current: number;
  baseline: number;
  day?: number;
  now: string;
  limit?: number;
}) =>
  calculateMeterMetrics({
    currentReading: o.current,
    cycleStartReading: o.baseline,
    billingCycleDay: o.day ?? 10,
    targetUnitLimit: o.limit ?? 200,
    now: D(o.now),
  });

// ---------------------------------------------------------------------------
describe("1. Formula accuracy (white box, formula-by-formula)", () => {
  it("Delta Units = Current - Baseline", () => {
    const m = run({ current: 4580, baseline: 4400, now: "2026-09-20" });
    expect(m.unitsConsumed).toBe(180);
  });

  it("Daily Burn Rate = Delta / Days Elapsed", () => {
    // cycleDay 10, now Sep 20 -> 11 days elapsed (10th..20th inclusive)
    const m = run({ current: 4580, baseline: 4400, now: "2026-09-20" });
    expect(m.daysElapsed).toBe(11);
    expect(m.dailyBurnRate).toBe(Number((180 / 11).toFixed(2)));
  });

  it("Projected = Delta + (Burn Rate * Days Remaining)", () => {
    const m = run({ current: 4580, baseline: 4400, now: "2026-09-20" });
    const expected =
      180 + Number((180 / 11).toFixed(2)) * m.daysRemaining;
    expect(m.projectedUnits).toBe(Number(expected.toFixed(2)));
  });

  it("Recommended Cap = max(0, limit - delta) / daysRemaining", () => {
    const m = run({ current: 4420, baseline: 4400, now: "2026-09-20" });
    expect(m.daysElapsed).toBe(11);
    expect(m.daysRemaining).toBe(19);
    expect(m.recommendedDailyCap).toBe(Number((180 / 19).toFixed(2)));
  });

  it("Cap is 0 (never negative) when consumption already exceeds limit", () => {
    const m = run({ current: 4700, baseline: 4400, now: "2026-09-20" });
    expect(m.unitsConsumed).toBe(300);
    expect(m.recommendedDailyCap).toBe(0);
  });

  it("Cap is 0 on the final day of the cycle (no days remaining)", () => {
    const m = run({ current: 4450, baseline: 4400, now: "2026-10-09" });
    expect(m.daysElapsed).toBe(30);
    expect(m.daysRemaining).toBe(0);
    expect(m.recommendedDailyCap).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("2. Zero / boundary day counts", () => {
  it("day 1 of the cycle: elapsed = 1, never 0 (avoids div-by-zero)", () => {
    const m = run({ current: 4420, baseline: 4400, now: "2026-09-10" });
    expect(m.daysElapsed).toBe(1);
    expect(m.daysRemaining).toBe(29);
    expect(Number.isFinite(m.dailyBurnRate)).toBe(true);
  });

  it("exact anchor day rolls to the NEW cycle (today >= anchor)", () => {
    const m = run({ current: 4420, baseline: 4400, now: "2026-10-10" });
    expect(m.cycleStartDate).toBe("2026-10-10");
    expect(m.daysElapsed).toBe(1);
  });

  it("day before the anchor belongs to the PREVIOUS cycle", () => {
    const m = run({ current: 4420, baseline: 4400, now: "2026-10-09" });
    expect(m.cycleStartDate).toBe("2026-09-10");
    expect(m.daysElapsed).toBe(30);
    expect(m.daysRemaining).toBe(0);
  });

  it("elapsed is clamped to 30 and remaining never goes negative", () => {
    for (const day of [1, 5, 15, 28, 30, 31]) {
      for (const now of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
        const m = run({ current: 4500, baseline: 4400, day, now });
        expect(m.daysElapsed).toBeGreaterThanOrEqual(1);
        expect(m.daysElapsed).toBeLessThanOrEqual(CYCLE_LENGTH_DAYS);
        expect(m.daysRemaining).toBeGreaterThanOrEqual(0);
        expect(m.daysElapsed + m.daysRemaining).toBe(CYCLE_LENGTH_DAYS);
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe("3. Negative / inverted deltas", () => {
  it("negative delta is clamped to 0 (no negative consumption)", () => {
    const m = run({ current: 4000, baseline: 4400, now: "2026-09-20" });
    expect(m.unitsConsumed).toBe(0);
    expect(m.dailyBurnRate).toBe(0);
    expect(m.projectedUnits).toBe(0);
  });

  it("zero delta yields zero burn and zero projection", () => {
    const m = run({ current: 4400, baseline: 4400, now: "2026-09-20" });
    expect(m.unitsConsumed).toBe(0);
    expect(m.projectedUnits).toBe(0);
    expect(m.zone).toBe("safe");
  });

  it("baseline above latest cannot yield a negative gauge", () => {
    const m = run({ current: 4100, baseline: 4400, now: "2026-09-20" });
    expect(m.percentOfLimit).toBeGreaterThanOrEqual(0);
    expect(m.unitsConsumed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("4. 30-day window is month-length independent (leap years)", () => {
  const combos: Array<[number, string]> = [
    [1, "2024-01-15"],  // Jan, 31 days
    [31, "2024-02-15"], // leap Feb (29 days) - day 31 must clamp
    [30, "2024-02-29"], // leap day
    [31, "2023-02-15"], // non-leap Feb (28 days) - day 31 must clamp
    [15, "2024-12-20"], // year rollover
    [5, "2025-03-10"],
  ];

  it.each(combos)(
    "day %i at %s -> window is exactly 30 days",
    (day, now) => {
      const m = run({ current: 4500, baseline: 4400, day, now });
      const diff =
        (D(m.cycleEndDate).getTime() - D(m.cycleStartDate).getTime()) /
        86_400_000;
      expect(diff).toBe(CYCLE_LENGTH_DAYS);
    },
  );

  it("Feb 2024 (leap) and Feb 2023 produce the same window length", () => {
    const a = run({ current: 4500, baseline: 4400, day: 30, now: "2024-02-15" });
    const b = run({ current: 4500, baseline: 4400, day: 30, now: "2023-02-15" });
    const len = (m: { cycleStartDate: string; cycleEndDate: string }) =>
      (D(m.cycleEndDate).getTime() - D(m.cycleStartDate).getTime()) / 86_400_000;
    expect(len(a)).toBe(30);
    expect(len(b)).toBe(30);
  });

  it("day 31 in a 30-day month anchors to the 30th, never an invalid date", () => {
    const m = run({ current: 4500, baseline: 4400, day: 31, now: "2024-04-15" });
    expect(m.cycleStartDate).toBe("2024-03-31");
    expect(m.billingCycleDay).toBe(31);
  });

  it("no cycle start date ever lands in the future", () => {
    for (const day of Array.from({ length: 31 }, (_, i) => i + 1)) {
      for (let d = 1; d <= 28; d++) {
        const now = `2024-02-${String(d).padStart(2, "0")}`;
        expect(getCycleStartDate(day, D(now)).getTime()).toBeLessThanOrEqual(D(now).getTime());
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe("5. Status zoning thresholds", () => {
  it("SAFE below 160 projected", () => {
    expect(getStatusZone(159.99, 100)).toBe("safe");
  });

  it("WARNING at exactly 160 projected", () => {
    expect(getStatusZone(160, 160)).toBe("warning");
  });

  it("WARNING up to 179 projected", () => {
    expect(getStatusZone(179, 179)).toBe("warning");
  });

  it("CRITICAL at exactly 180 projected", () => {
    expect(getStatusZone(180, 180)).toBe("critical");
  });

  it("CRITICAL when 185 units already consumed regardless of projection", () => {
    expect(getStatusZone(1, 185)).toBe("critical");
  });

  it("185 is inclusive, 184 is not", () => {
    expect(getStatusZone(1, 185)).toBe("critical");
    expect(getStatusZone(1, 184)).toBe("safe");
  });

  it("day 30 of cycle: zone maps 1:1 onto units consumed", () => {
    const cases: Array<[number, string]> = [
      [159, "safe"],
      [160, "warning"],
      [179, "warning"],
      [180, "critical"],
    ];
    for (const [units, expected] of cases) {
      const m = run({ current: 4400 + units, baseline: 4400, now: "2026-10-09" });
      expect(m.zone).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
describe("6. Gauge clamp + overlimit", () => {
  it("percentOfLimit clamps to 100 when far past the limit", () => {
    const m = run({ current: 6000, baseline: 4400, now: "2026-10-09" });
    expect(m.unitsConsumed).toBe(1600);
    expect(m.percentOfLimit).toBe(100);
    expect(m.overLimit).toBe(true);
  });

  it("percentOfLimit is 0 when nothing consumed", () => {
    const m = run({ current: 4400, baseline: 4400, now: "2026-09-20" });
    expect(m.percentOfLimit).toBe(0);
  });

  it("percentOfLimit scales linearly mid-range", () => {
    const m = run({ current: 4500, baseline: 4400, now: "2026-10-09" });
    expect(m.percentOfLimit).toBe(50);
  });

  it("cycleProgress is always within 0..1", () => {
    for (const now of ["2026-09-10", "2026-09-25", "2026-10-09", "2026-10-10"]) {
      const m = run({ current: 4500, baseline: 4400, now });
      expect(m.cycleProgress).toBeGreaterThanOrEqual(0);
      expect(m.cycleProgress).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
describe("7. Input normalisation (clampCycleDay)", () => {
  it("accepts the full valid range", () => {
    expect(clampCycleDay(1)).toBe(1);
    expect(clampCycleDay(15)).toBe(15);
    expect(clampCycleDay(31)).toBe(31);
  });

  it("rejects out-of-range to the default (not the nearest edge)", () => {
    expect(clampCycleDay(0)).toBe(DEFAULT_BILLING_CYCLE_DAY);
    expect(clampCycleDay(-5)).toBe(DEFAULT_BILLING_CYCLE_DAY);
    expect(clampCycleDay(32)).toBe(DEFAULT_BILLING_CYCLE_DAY);
    expect(clampCycleDay(999)).toBe(DEFAULT_BILLING_CYCLE_DAY);
  });

  it("handles NaN and Infinity safely", () => {
    expect(clampCycleDay(NaN)).toBe(DEFAULT_BILLING_CYCLE_DAY);
    expect(clampCycleDay(Infinity)).toBe(DEFAULT_BILLING_CYCLE_DAY);
    expect(clampCycleDay(-Infinity)).toBe(DEFAULT_BILLING_CYCLE_DAY);
  });

  it("truncates fractional days", () => {
    expect(clampCycleDay(5.9)).toBe(5);
    expect(clampCycleDay(15.99)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
describe("8. Determinism / purity", () => {
  it("same inputs always produce identical output", () => {
    const a = run({ current: 4580, baseline: 4400, now: "2026-09-20" });
    const b = run({ current: 4580, baseline: 4400, now: "2026-09-20" });
    expect(a).toEqual(b);
  });

  it("getCycleEndDate is always start + 30", () => {
    const start = getCycleStartDate(7, D("2026-05-20"));
    const end = getCycleEndDate(7, D("2026-05-20"));
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(30);
  });

  it("custom targetUnitLimit is honoured", () => {
    const m = run({
      current: 4500,
      baseline: 4400,
      now: "2026-10-09",
      limit: 100,
    });
    expect(m.targetUnitLimit).toBe(100);
    expect(m.percentOfLimit).toBe(100);
  });
});