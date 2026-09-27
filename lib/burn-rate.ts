import type { ConsumptionZone } from "./types";
import { toLocalDateString } from "./utils";

/**
 * ---------------------------------------------------------------------------
 * PowerShield analytics engine (cumulative meter model)
 * ---------------------------------------------------------------------------
 * Users log the ACTUAL reading shown on their physical meter (e.g. 4580 kWh).
 * The engine derives every delta/burn/projection metric by comparing the
 * current reading against the cycle-start baseline reading.
 */

export interface CalculateMeterMetricsParams {
  /** Actual meter value logged today (e.g. 4580). */
  currentReading: number;
  /** Meter value captured at the start of the billing cycle (e.g. 4400). */
  cycleStartReading: number;
  /** Day of month (1-31) the billing cycle resets on. */
  billingCycleDay: number;
  /** Target slab limit in units (default 200). */
  targetUnitLimit?: number;
  /** Injectable clock — tests pass a fixed date; defaults to `new Date()`. */
  now?: Date;
}

export interface MeterMetrics {
  currentReading: number;
  cycleStartReading: number;
  /** Units consumed so far: max(0, currentReading - cycleStartReading). */
  unitsConsumed: number;
  targetUnitLimit: number;
  daysElapsed: number;
  daysRemaining: number;
  cycleLengthDays: number;
  /** Inclusive cycle bounds as YYYY-MM-DD (e.g. 2026-09-10 … 2026-10-09). */
  cycleStartDate: string;
  cycleEndDate: string;
  dailyBurnRate: number;
  projectedUnits: number;
  recommendedDailyCap: number;
  /** Zoning driven by projected units (see getStatusZone). */
  zone: ConsumptionZone;
  percentOfLimit: number;
  overLimit: boolean;
}

const MS_PER_DAY = 86_400_000;
const DEFAULT_TARGET_LIMIT = 200;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampCycleDay(day: number): number {
  const truncated = Math.trunc(day);
  if (!Number.isFinite(truncated)) return 1;
  return Math.min(Math.max(truncated, 1), 31);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffInDays(later: Date, earlier: Date): number {
  return Math.round(
    (startOfDay(later).getTime() - startOfDay(earlier).getTime()) / MS_PER_DAY,
  );
}

/**
 * Most recent occurrence of `billingCycleDay` on or before `asOf` in local
 * time, clamped to short months (day 31 → 28/29 during February).
 */
export function getCycleStartDate(
  billingCycleDay: number,
  asOf: Date = new Date(),
): Date {
  const day = clampCycleDay(billingCycleDay);
  const today = startOfDay(asOf);
  const thisMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(day, daysInMonth(today.getFullYear(), today.getMonth())),
  );
  if (thisMonth.getTime() <= today.getTime()) return thisMonth;

  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return new Date(
    previousMonth.getFullYear(),
    previousMonth.getMonth(),
    Math.min(day, daysInMonth(previousMonth.getFullYear(), previousMonth.getMonth())),
  );
}

function getNextCycleStart(cycleStart: Date, billingCycleDay: number): Date {
  const day = clampCycleDay(billingCycleDay);
  const nextMonth = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 1);
  return new Date(
    nextMonth.getFullYear(),
    nextMonth.getMonth(),
    Math.min(day, daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth())),
  );
}

/**
 * Status zoning (based on PROJECTED units):
 *  - SAFE:     projected < 160
 *  - WARNING:  projected 160 … 179
 *  - CRITICAL: projected >= 180 OR units already consumed >= 185
 */
export function getStatusZone(
  projectedUnits: number,
  unitsConsumed: number,
): ConsumptionZone {
  if (projectedUnits >= 180 || unitsConsumed >= 185) return "critical";
  if (projectedUnits >= 160) return "warning";
  return "safe";
}

export function calculateMeterMetrics({
  currentReading,
  cycleStartReading,
  billingCycleDay,
  targetUnitLimit = DEFAULT_TARGET_LIMIT,
  now = new Date(),
}: CalculateMeterMetricsParams): MeterMetrics {
  const safeLimit = Math.max(targetUnitLimit, 1);
  const unitsConsumed = Math.max(0, roundTo(currentReading - cycleStartReading, 2));

  const cycleStartDate = getCycleStartDate(billingCycleDay, now);
  const nextCycleStart = getNextCycleStart(cycleStartDate, billingCycleDay);
  const cycleLengthDays = Math.max(1, diffInDays(nextCycleStart, cycleStartDate));
  const daysElapsed = Math.max(1, diffInDays(now, cycleStartDate) + 1);
  const daysRemaining = Math.max(0, cycleLengthDays - daysElapsed);

  const dailyBurnRate = roundTo(unitsConsumed / daysElapsed, 2);
  const projectedUnits = roundTo(
    unitsConsumed + dailyBurnRate * daysRemaining,
    2,
  );
  const recommendedDailyCap = roundTo(
    daysRemaining > 0
      ? Math.max(0, safeLimit - unitsConsumed) / daysRemaining
      : 0,
    2,
  );

  const zone = getStatusZone(projectedUnits, unitsConsumed);
  const percentOfLimit = Math.min(
    Math.max(roundTo((unitsConsumed / safeLimit) * 100, 1), 0),
    100,
  );

  return {
    currentReading,
    cycleStartReading,
    unitsConsumed,
    targetUnitLimit: safeLimit,
    daysElapsed,
    daysRemaining,
    cycleLengthDays,
    cycleStartDate: toLocalDateString(cycleStartDate),
    /* Inclusive last day of the cycle (day before the next reset). */
    cycleEndDate: toLocalDateString(
      new Date(nextCycleStart.getTime() - MS_PER_DAY),
    ),
    dailyBurnRate,
    projectedUnits,
    recommendedDailyCap,
    zone,
    percentOfLimit,
    overLimit: unitsConsumed > safeLimit,
  };
}
