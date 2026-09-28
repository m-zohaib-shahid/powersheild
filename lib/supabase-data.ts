import "server-only";

import {
  getAuthUserId,
  getBillingCycleDay,
  getCycleStartReading,
  getLatestReading,
  getRecentReadings,
  type MeterLog,
} from "@/app/actions/meter";
import { calculateMeterMetrics, DEFAULT_BILLING_CYCLE_DAY } from "@/lib/burn-rate";
import { DASHBOARD, MOCK_READINGS } from "@/lib/mock-data";
import { getDeltaZone } from "@/lib/tariff";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { selectOwnedRows } from "@/lib/user-scope";
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

  /* The user's own billing anchor wins; otherwise fall back to the default. */
  const [billingCycleDay, userId] = await Promise.all([
    safeBillingCycleDay(DASHBOARD.billingCycleDay),
    safeUserId(),
  ]);

  const [latestResult, baselineResult, historyResult] = await Promise.all([
    settle(() => getLatestReading()),
    settle(() => getCycleStartReading(billingCycleDay)),
    settle(() => getRecentReadings(5)),
  ]);

  const latestLog = latestResult.ok ? latestResult.data : null;
  const cycleStartReading = baselineResult.ok ? baselineResult.data : null;
  const history = historyResult.ok ? historyResult.data : [];

  /**
   * Only fall back to mock data when Supabase is genuinely NOT configured.
   *
   * Previously ANY failure (a transient error, an RLS denial, an empty table)
   * silently replaced live data with the hardcoded 180-unit mock snapshot,
   * which is why production looked "stuck" on demo numbers even with the
   * environment variables present.
   *
   * When Supabase IS configured we surface the real (possibly empty) state so
   * the UI reflects the database instead of pretending.
   */
  const supabaseAvailable = isSupabaseConfigured();

  if (!latestLog || cycleStartReading === null) {
    /* Live but empty: keep the real anchor and show an honest empty state. */
    if (supabaseAvailable) {
      return {
        snapshot: {
          ...DASHBOARD,
          currentReading: latestLog?.reading_value ?? DASHBOARD.currentReading,
          cycleStartReading:
            cycleStartReading ?? latestLog?.reading_value ?? DASHBOARD.currentReading,
          billingCycleDay,
        },
        entries: history.length > 0 ? mapLogsToEntries(history, cycleStartReading ?? 0) : [],
        metrics: calculateMeterMetrics({
          currentReading: latestLog?.reading_value ?? DASHBOARD.currentReading,
          cycleStartReading:
            cycleStartReading ?? latestLog?.reading_value ?? DASHBOARD.currentReading,
          billingCycleDay,
          targetUnitLimit: targetLimit,
        }),
        isLive: true,
        userId,
      };
    }

    /* Genuinely unconfigured (local mock mode / missing env): demo snapshot. */
    return {
      /* Keep the persisted anchor even while the meter table is still empty,
         so the cycle banner reflects the user's real billing day. */
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

  const currentReading = latestLog.reading_value;

  return {
    snapshot: {
      currentReading,
      cycleStartReading,
      billingCycleDay,
      targetLimit,
      lastUpdated: formatLastUpdated(latestLog.reading_date),
    },
    entries: mapLogsToEntries(
      selectOwnedRows(history, userId),
      cycleStartReading,
    ),
    metrics: calculateMeterMetrics({
      currentReading,
      cycleStartReading,
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
