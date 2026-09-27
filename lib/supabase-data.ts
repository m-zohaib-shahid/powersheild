import "server-only";

import {
  getCycleStartReading,
  getLatestReading,
  getRecentReadings,
  type MeterLog,
} from "@/app/actions/meter";
import { calculateMeterMetrics } from "@/lib/burn-rate";
import { DASHBOARD, MOCK_READINGS } from "@/lib/mock-data";
import { getDeltaZone } from "@/lib/tariff";
import type {
  DashboardSnapshot,
  MeterReadingEntry,
} from "@/lib/types";
import type { MeterMetrics } from "@/lib/burn-rate";

/** Everything the dashboard needs to render its first paint. */
export interface DashboardData {
  snapshot: DashboardSnapshot;
  entries: MeterReadingEntry[];
  metrics: MeterMetrics;
  /** False when Supabase was unreachable/empty and mock data is being shown. */
  isLive: boolean;
}

/**
 * Maps raw `meter_logs` rows (newest first) into the UI history model.
 *
 * Deltas are always derived here: each row is compared against the next
 * (older) row, and the oldest row falls back to the cycle baseline.
 */
function mapLogsToEntries(
  logs: MeterLog[],
  cycleStartReading: number,
): MeterReadingEntry[] {
  return logs.map((log, index) => {
    const older = logs[index + 1];
    const previousValue = older ? older.reading_value : cycleStartReading;
    const delta = Number((log.reading_value - previousValue).toFixed(1));

    return {
      id: log.id,
      date: log.reading_date,
      reading: log.reading_value,
      delta: Math.max(0, delta),
      zone: getDeltaZone(Math.max(0, delta)),
    };
  });
}

/**
 * Server-side data loader for the dashboard.
 *
 * Reads the latest reading, the cycle-start baseline and the recent history
 * from Supabase in parallel, then derives the analytics engine output. If
 * Supabase is not configured, errors, or the table is still empty, it falls
 * back to the static mock snapshot so the UI never renders a broken state.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const billingCycleDay = DASHBOARD.billingCycleDay;
  const targetLimit = DASHBOARD.targetLimit;

  const [latestResult, baselineResult, historyResult] = await Promise.all([
    getLatestReading(),
    getCycleStartReading(billingCycleDay),
    getRecentReadings(5),
  ]);

  const latestLog = latestResult.ok ? latestResult.data : null;
  const cycleStartReading = baselineResult.ok ? baselineResult.data : null;
  const history = historyResult.ok ? historyResult.data : [];

  /* Mock fallback: not configured, query failed, or table has no rows yet. */
  if (!latestLog || cycleStartReading === null) {
    return {
      snapshot: DASHBOARD,
      entries: MOCK_READINGS,
      metrics: calculateMeterMetrics({
        currentReading: DASHBOARD.currentReading,
        cycleStartReading: DASHBOARD.cycleStartReading,
        billingCycleDay,
        targetUnitLimit: targetLimit,
      }),
      isLive: false,
    };
  }

  const currentReading = latestLog.reading_value;

  return {
    snapshot: {
      currentReading,
      cycleStartReading,
      billingCycleDay,
      targetLimit,
      lastUpdated: formatLastUpdated(latestLog.reading_date),
    },
    entries: mapLogsToEntries(history, cycleStartReading),
    metrics: calculateMeterMetrics({
      currentReading,
      cycleStartReading,
      billingCycleDay,
      targetUnitLimit: targetLimit,
    }),
    isLive: true,
  };
}

/** Human-friendly "Updated ..." label for the gauge card header. */
function formatLastUpdated(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
