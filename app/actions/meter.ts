"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  clampCycleDay,
  DEFAULT_BILLING_CYCLE_DAY,
  getCycleStartDate,
} from "@/lib/burn-rate";
import { buildUserScopeFilter } from "@/lib/user-scope";
import {
  createClient,
  isSupabaseConfigured,
} from "@/utils/supabase/server";

/** Row shape of the `meter_logs` table (raw readings only -- never deltas). */
export interface MeterLog {
  id: string;
  /** Raw cumulative meter index exactly as displayed on the meter (kWh). */
  reading_value: number;
  /** Calendar date the reading was taken (YYYY-MM-DD). */
  reading_date: string;
  /** Owning account, or null for shared demo/seed rows. */
  user_id?: string | null;
  created_at?: string;
}

/** Discriminated result returned by every action (errors never throw). */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const METER_LOGS_TABLE = "meter_logs";
const PROFILES_TABLE = "profiles";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Columns selected by every read query (kept in one place). */
const LOG_COLUMNS = "id, reading_value, reading_date, user_id, created_at";

/**
 * Resolves a request-scoped Supabase client using the incoming cookies.
 * Returns `null` when the project is not configured so callers can fall back
 * to mock data instead of failing the whole render.
 */
async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  return createClient(await cookies());
}

/**
 * Returns the authenticated user id, or `null` for anonymous visitors.
 *
 * Never throws: a missing/broken session simply resolves to `null`, which
 * keeps the demo/shared-row path working until the auth UI lands.
 */
export async function getAuthUserId(): Promise<string | null> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Today's date in the server's LOCAL timezone.
 *
 * Deliberately avoids `new Date().toISOString().split("T")[0]`, which returns
 * the UTC day -- for UTC+05:00 (Pakistan) a reading logged at 1:00 AM would be
 * stamped with the previous day, silently corrupting the billing-cycle math.
 */
function toLocalIsoDate(): string {
  return toIsoDate(new Date());
}

/**
 * Stores the RAW meter reading (actual display value, e.g. 4580 kWh) into
 * `meter_logs`. Delta units are NEVER persisted -- they are always derived at
 * read-time by comparing against the cycle-start baseline reading.
 *
 * The owning account is resolved from the Supabase session. Signed-in users
 * get their rows scoped to `user_id`; anonymous visitors write shared rows
 * with `user_id = null` (RLS decides whether that is permitted).
 *
 * @param readingValue Raw meter index shown on the physical meter.
 * @param readingDate  Optional ISO date (YYYY-MM-DD). Defaults to today, in
 *                     the SERVER's local timezone -- never `toISOString()`,
 *                     which would shift the day for UTC+ users.
 */
export async function logMeterReading(
  readingValue: number,
  readingDate?: string,
): Promise<ActionResult<MeterLog>> {
  if (!Number.isFinite(readingValue) || readingValue < 0) {
    return { ok: false, error: "readingValue must be a non-negative number." };
  }

  const resolvedDate = readingDate ?? toLocalIsoDate();
  if (!ISO_DATE_PATTERN.test(resolvedDate)) {
    return { ok: false, error: "readingDate must be formatted as YYYY-MM-DD." };
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase is not configured." };
    }

    /* Attach the active session user when one exists. */
    const userId = await getAuthUserId();

    const { data, error } = await supabase
      .from(METER_LOGS_TABLE)
      .insert({
        reading_value: readingValue,
        reading_date: resolvedDate,
        user_id: userId ?? null,
      })
      .select(LOG_COLUMNS)
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as MeterLog };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}

/**
 * Cycle start baseline: the FIRST reading logged on or after the current
 * cycle's start day (`billingCycleDay`, clamped to short months). Returns
 * `null` when no reading exists yet in the active cycle.
 */
export async function getCycleStartReading(
  billingCycleDay: number,
  asOf: Date = new Date(),
): Promise<ActionResult<number | null>> {
  try {
    const cycleStartIso = toIsoDate(getCycleStartDate(billingCycleDay, asOf));
    const supabase = await getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase is not configured." };
    }

    /* Scope to the caller: own rows + shared demo rows. */
    const userId = await getAuthUserId();
    const scope = buildUserScopeFilter(userId);

    let query = supabase
      .from(METER_LOGS_TABLE)
      .select(LOG_COLUMNS)
      .gte("reading_date", cycleStartIso)
      .order("reading_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);

    if (scope) query = query.or(scope);

    const { data, error } = await query;

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data?.[0] as MeterLog | undefined)?.reading_value ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}

/** Most recent meter log (any date), used as "previous reading" in the UI. */
export async function getLatestReading(): Promise<ActionResult<MeterLog | null>> {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase is not configured." };
    }

    /* Scope to the caller: own rows + shared demo rows. */
    const userId = await getAuthUserId();
    const scope = buildUserScopeFilter(userId);

    let query = supabase
      .from(METER_LOGS_TABLE)
      .select(LOG_COLUMNS)
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (scope) query = query.or(scope);

    const { data, error } = await query;

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data?.[0] as MeterLog | undefined) ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}

/**
 * Convenience snapshot for the burn-rate engine: the latest raw reading plus
 * the cycle-start baseline, both fetched in parallel.
 */
export async function getMeterSnapshot(
  billingCycleDay: number,
  asOf: Date = new Date(),
): Promise<
  ActionResult<{
    currentReading: number | null;
    cycleStartReading: number | null;
    latestLog: MeterLog | null;
    /** Authenticated caller, or null for an anonymous demo session. */
    userId: string | null;
  }>
> {
  const [latest, baseline] = await Promise.all([
    getLatestReading(),
    getCycleStartReading(billingCycleDay, asOf),
  ]);

  if (!latest.ok) return { ok: false, error: latest.error };
  if (!baseline.ok) return { ok: false, error: baseline.error };

  return {
    ok: true,
    data: {
      currentReading: latest.data?.reading_value ?? null,
      cycleStartReading: baseline.data,
      latestLog: latest.data,
      userId: await getAuthUserId(),
    },
  };
}

/**
 * Most recent raw readings (newest first) for the dashboard history list.
 * Deltas are derived per row by comparing against the preceding (older)
 * reading, so the client never has to store them.
 */
export async function getRecentReadings(
  limit = 5,
): Promise<ActionResult<MeterLog[]>> {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase is not configured." };
    }

    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 5, 1), 100);

    /* Scope to the caller: own rows + shared demo rows. */
    const userId = await getAuthUserId();
    const scope = buildUserScopeFilter(userId);

    let query = supabase
      .from(METER_LOGS_TABLE)
      .select(LOG_COLUMNS)
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (scope) query = query.or(scope);

    const { data, error } = await query;

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as MeterLog[] };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  } 
}

/* =============================================================================
 * User profile preferences (public.profiles)
 * ==========================================================================*/

/** The single shared profile row. Matches the live table in Supabase. */
const PROFILE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Reads the persisted billing cycle day from `public.profiles`.
 *
 * Falls back to `fallbackDay` (default 5) when the table is unreachable, the
 * row is missing, or the stored value is invalid - the dashboard must always
 * have a usable anchor.
 */
export async function getBillingCycleDay(
  fallbackDay: number = DEFAULT_BILLING_CYCLE_DAY,
): Promise<number> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return fallbackDay;

    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select("billing_cycle_day")
      .eq("id", PROFILE_ID)
      .maybeSingle();

    if (error || !data) return fallbackDay;
    return clampCycleDay(data.billing_cycle_day ?? fallbackDay);
  } catch {
    return fallbackDay;
  }
}

/**
 * Persists the billing cycle day to `public.profiles` and revalidates the
 * dashboard so the 30-day window, burn rate and projections refresh instantly.
 *
 * The table holds a single shared profile row, so this upserts by a fixed
 * sentinel id. When an auth user IS present we still prefer that user id, so
 * the row can later be migrated to a per-user key without changing callers.
 *
 * Never throws: every failure is returned as `{ ok: false }` so the calling
 * client can show an inline error instead of crashing the server action.
 */
export async function updateBillingCycleDay(
  billingCycleDay: number,
): Promise<ActionResult<number>> {
  const day = clampCycleDay(billingCycleDay);

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase is not configured." };
    }

    /* Signed in -> own row; anonymous -> the shared fallback row. */
    const userId = await getAuthUserId();
    const rowId = userId ?? PROFILE_ID;

    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .upsert(
        {
          id: rowId,
          billing_cycle_day: day,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("id, billing_cycle_day")
      .single();

    if (error) {
      /* Schema drift (e.g. a per-user `user_id` key instead of `id`) should
         degrade gracefully rather than break the settings modal. */
      return { ok: false, error: error.message };
    }

    /* Purge the RSC cache for the dashboard so the new cycle window paints. */
    revalidatePath("/dashboard");

    return { ok: true, data: clampCycleDay(data.billing_cycle_day) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}