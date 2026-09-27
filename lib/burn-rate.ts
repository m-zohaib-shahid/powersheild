import type { ConsumptionZone } from "./types";
import { toLocalDateString } from "./utils";

/**
 * ---------------------------------------------------------------------------
 * PowerShield analytics engine (cumulative meter + 30-day window model)
 * ---------------------------------------------------------------------------
 * Users log the ACTUAL reading shown on their physical meter (e.g. 4580 kWh).
 * The engine derives every delta/burn/projection metric by comparing the
 * current reading against the cycle-start baseline reading.
 *
 * The billing cycle is a FIXED 30-DAY WINDOW anchored to `billingCycleDay`:
 *   * today >= billingCycleDay -> cycle started on that day THIS month
 *   * today <  billingCycleDay -> cycle started on that day LAST month
 * The window always ends exactly 30 days after it starts, so a cycle anchored
 * on the 5th always closes on the 5th of the following month regardless of
 * month length (Feb 28/29 days never stretches or shrinks the window).
 */

/** Every PowerShield billing cycle is exactly this long. */
export const CYCLE_LENGTH_DAYS = 30;

/** Fallback anchor used when a user has not configured one yet. */
export const DEFAULT_BILLING_CYCLE_DAY = 10;

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
  /** Cycle start as YYYY-MM-DD (e.g. 2026-09-05). */
  cycleStartDate: string;
  /** Cycle resets as YYYY-MM-DD - exactly 30 days later (e.g. 2026-10-05). */
  cycleEndDate: string;
  /** Configured anchor day (1-31) that produced this window. */
  billingCycleDay: number;
  dailyBurnRate: number;
  projectedUnits: number;
  recommendedDailyCap: number;
  /** Zoning driven by projected units (see getStatusZone). */
  zone: ConsumptionZone;
  percentOfLimit: number;
  /** Fraction of the 30-day window consumed (0-1), for progress bars. */
  cycleProgress: number;
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

/**
 * Normalises any input into a valid 1-31 anchor day.
 *
 * Values below 1 or above 31 are NOT clamped to the nearest edge - they are
 * invalid, so they fall back to the default. This matters because 0/NaN would
 * otherwise silently become day 1 and shift the whole billing window.
 */
export function clampCycleDay(day: number): number {
  const truncated = Math.trunc(day);
  if (!Number.isFinite(truncated) || truncated < 1 || truncated > 31) {
    return DEFAULT_BILLING_CYCLE_DAY;
  }
  return truncated;
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
 * Start of the ACTIVE 30-day cycle window, in local time.
 *
 * If today falls on or after the anchor day, the cycle began on that day this
 * month; otherwise it began on that day last month. The anchor is clamped to
 * short months (day 31 -> 28/29 in February) so the date always exists.
 */
export function getCycleStartDate(
  billingCycleDay: number,
  asOf: Date = new Date(),
): Date {
  const day = clampCycleDay(billingCycleDay);
  const today = startOfDay(asOf);

  const anchoredThisMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(day, daysInMonth(today.getFullYear(), today.getMonth())),
  );
  if (anchoredThisMonth.getTime() <= today.getTime()) {
    return anchoredThisMonth;
  }

  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return new Date(
    previousMonth.getFullYear(),
    previousMonth.getMonth(),
    Math.min(
      day,
      daysInMonth(previousMonth.getFullYear(), previousMonth.getMonth()),
    ),
  );
}

/** The reset boundary: the active cycle's start plus exactly 30 days. */
export function getCycleEndDate(
  billingCycleDay: number,
  asOf: Date = new Date(),
): Date {
  const start = getCycleStartDate(billingCycleDay, asOf);
  return new Date(startOfDay(start).getTime() + CYCLE_LENGTH_DAYS * MS_PER_DAY);
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
  const cycleEndDate = getCycleEndDate(billingCycleDay, now);

  /* Day 1 = the anchor day itself, so elapsed is clamped to 1..30. */
  const daysElapsed = Math.min(
    Math.max(diffInDays(now, cycleStartDate) + 1, 1),
    CYCLE_LENGTH_DAYS,
  );
  const daysRemaining = Math.max(0, CYCLE_LENGTH_DAYS - daysElapsed);

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
    cycleLengthDays: CYCLE_LENGTH_DAYS,
    cycleStartDate: toLocalDateString(cycleStartDate),
    cycleEndDate: toLocalDateString(cycleEndDate),
    billingCycleDay: clampCycleDay(billingCycleDay),
    dailyBurnRate,
    projectedUnits,
    recommendedDailyCap,
    zone,
    percentOfLimit,
    cycleProgress: daysElapsed / CYCLE_LENGTH_DAYS,
    overLimit: unitsConsumed > safeLimit,
  };
}
