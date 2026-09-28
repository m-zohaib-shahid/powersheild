import "server-only";

import {
  getAuthUserId,
  getBillingCycleDay,
  getCycleBaseline,
  getLatestReading,
  getRecentReadings,
  type CycleBaseline,
  type MeterLog,
} from "@/app/actions/meter";
import {
  calculateMeterMetrics,
  DEFAULT_BILLING_CYCLE_DAY,
  getCycleStartDate,
} from "@/lib/burn-rate";
import { DASHBOARD, MOCK_READINGS } from "@/lib/mock-data";
import { getDeltaZone } from "@/lib/tariff";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { selectOwnedRows } from "@/lib/user-scope";
import { toLocalDateString } from "@/lib/utils";
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
  /** Authenticated caller id, or null for the anonymous demo session. */
  userId: string | null;
}

/** How the cycle baseline was chosen (surfaced for debugging/UI copy). */
export type BaselineSource = "cycle-first" | "previous-cycle" | "none";

/** Resolved baseline for the active cycle, with the row it came from. */
export interface ResolvedBaseline {
  /** The kWh value consumed-units are measured from. */
  reading: number;
  source: BaselineSource;
  /** ISO date of the log the baseline came from, when one exists. */
  logDate: string | null;
}

/**
 * Applies the baseline fallback chain to the active cycle.
 *
 * Priority:
 *   1. `firstInCycle`    - first log on/after the cycle start (authoritative)
 *   2. `lastBeforeCycle` - previous cycle's closing reading
 *   3. `latest`          - most recent reading anywhere (last resort)
 *   4. `0`               - nothing stored yet
 *
 * The engine clamps consumption at 0, so a baseline that somehow sits above
 * the latest reading can never produce negative units.
 */
function resolveBaseline(
  baseline: CycleBaseline,
  latest: MeterLog | null,
  latestValue: number,
): ResolvedBaseline {
  if (baseline.firstInCycle) {
    return {
      reading: baseline.firstInCycle.reading_value,
      source: "cycle-first",
      logDate: baseline.firstInCycle.reading_date,
    };
  }

  if (baseline.lastBeforeCycle) {
    return {
      reading: baseline.lastBeforeCycle.reading_value,
      source: "previous-cycle",
      logDate: baseline.lastBeforeCycle.reading_date,
    };
  }

  if (latest) {
    return {
      reading: latest.reading_value,
      source: "none",
      logDate: latest.reading_date,
    };
  }

  return { reading: 0, source: "none", logDate: null };
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
 * Resolves the persisted billing anchor without ever throwing.
 *
 * The `profiles` table is optional infrastructure: it may not exist yet, RLS
 * may deny the read, or Supabase may be unreachable from the Vercel runtime.
 * In every one of those cases the dashboard must still render, so we fall back
 * to the static mock day rather than propagating an error into the RSC render.
 */
async function safeBillingCycleDay(fallback: number): Promise<number> {
  try {
    const day = await getBillingCycleDay(fallback);
    return Number.isFinite(day) ? day : fallback;
  } catch {
    return fallback;
  }
}

/** Resolves the session user id without ever throwing. */
async function safeUserId(): Promise<string | null> {
  try {
    return await getAuthUserId();
  } catch {
    return null;
  }
}

/**
 * Runs a Supabase-backed action, converting any thrown/rejected call into the
 * action's own `{ ok: false }` shape so one failure cannot abort the render.
 */
async function settle<T>(
  run: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return await run();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}

/**
 * Server-side data loader for the dashboard.
 *
 * Reads the latest reading, the cycle-start baseline and the recent history
 * from Supabase in parallel, then derives the analytics engine output. If
 * Supabase is not configured, errors, or the table is still empty, it falls
 * back to the static mock snapshot so the UI never renders a broken state.
 *
 * The whole body is additionally wrapped in a top-level guard: this function
 * runs inside a Server Component, so ANY unhandled rejection here surfaces as
 * a 500 on Vercel. It must always resolve with renderable data.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const targetLimit = DASHBOARD.targetLimit;

  /* 1. The user's own billing anchor wins; otherwise fall back to the default. */
  const [billingCycleDay, userId] = await Promise.all([
    safeBillingCycleDay(DASHBOARD.billingCycleDay),
    safeUserId(),
  ]);

  /* 2. Resolve the ACTIVE cycle start date for that anchor.
     e.g. cycle_day = 10, today = Sep 28  ->  cycle starts Sep 10, 2026. */
  const cycleStartIso = toLocalDateString(
    getCycleStartDate(billingCycleDay, new Date()),
  );

  /* 3. Fetch latest reading, baseline candidates and history in parallel. */
  const [latestResult, baselineResult, historyResult] = await Promise.all([
    settle(() => getLatestReading()),
    settle(() => getCycleBaseline(cycleStartIso)),
    settle(() => getRecentReadings(5)),
  ]);

  const latestLog = latestResult.ok ? latestResult.data : null;
  const baseline: CycleBaseline = baselineResult.ok
    ? baselineResult.data
    : { firstInCycle: null, lastBeforeCycle: null };
  const history = historyResult.ok ? historyResult.data : [];

  /* Supabase genuinely unconfigured -> demo snapshot (local mock mode). */
  if (!isSupabaseConfigured()) {
    return {
      snapshot: { ...DASHBOARD, billingCycleDay },
      entries: MOCK_READINGS,
      metrics: calculateMeterMetrics({
        currentReading: DASHBOARD.currentReading,
        cycleStartReading: DASHBOARD.cycleStartReading,
        billingCycleDay,
        targetUnitLimit: targetLimit,
      }),
      isLive: false,
      userId,
    };
  }

  /* Nothing stored at all: an empty, honest state rather than fake numbers. */
  if (!latestLog) {
    return {
      snapshot: {
        ...DASHBOARD,
        currentReading: 0,
        cycleStartReading: 0,
        billingCycleDay,
        lastUpdated: "No readings yet",
      },
      entries: [],
      metrics: calculateMeterMetrics({
        currentReading: 0,
        cycleStartReading: 0,
        billingCycleDay,
        targetUnitLimit: targetLimit,
      }),
      isLive: true,
      userId,
    };
  }

  /* 4. Strict baseline chain, then Delta = latest - baseline. */
  const currentReading = latestLog.reading_value;
  const resolved = resolveBaseline(baseline, latestLog, currentReading);

  return {
    snapshot: {
      currentReading,
      cycleStartReading: resolved.reading,
      billingCycleDay,
      targetLimit,
      lastUpdated: formatLastUpdated(latestLog.reading_date),
    },
    entries: mapLogsToEntries(
      selectOwnedRows(history, userId),
      resolved.reading,
    ),
    metrics: calculateMeterMetrics({
      currentReading,
      cycleStartReading: resolved.reading,
      billingCycleDay,
      targetUnitLimit: targetLimit,
    }),
    isLive: true,
    userId,
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

/** Fully offline snapshot used when anything at all goes wrong. */
function emergencyFallback(): DashboardData {
  return {
    snapshot: { ...DASHBOARD, billingCycleDay: DEFAULT_BILLING_CYCLE_DAY },
    entries: MOCK_READINGS,
    metrics: calculateMeterMetrics({
      currentReading: DASHBOARD.currentReading,
      cycleStartReading: DASHBOARD.cycleStartReading,
      billingCycleDay: DEFAULT_BILLING_CYCLE_DAY,
      targetUnitLimit: DASHBOARD.targetLimit,
    }),
    isLive: false,
    userId: null,
  };
}

/**
 * Production-safe entry point used by the dashboard route.
 *
 * `getDashboardData` is wrapped so that an unexpected throw (Supabase outage,
 * schema drift, invalid data) degrades to mock data instead of producing a
 * 500 from the Server Component on Vercel.
 */
export async function getDashboardDataSafe(): Promise<DashboardData> {
  try {
    return await getDashboardData();
  } catch (error) {
    console.error(
      "[PowerShield] dashboard data load failed, using mock fallback:",
      error,
    );
    return emergencyFallback();
  }
}
