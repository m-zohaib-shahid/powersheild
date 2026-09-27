"use server";

import { cookies } from "next/headers";

import { getCycleStartDate } from "@/lib/burn-rate";
import {
  createClient,
  isSupabaseConfigured,
} from "@/utils/supabase/server";

/** Row shape of the `meter_logs` table (raw readings only — never deltas). */
export interface MeterLog {
  id: string;
  /** Raw cumulative meter index exactly as displayed on the meter (kWh). */
  reading_value: number;
  /** Calendar date the reading was taken (YYYY-MM-DD). */
  reading_date: string;
  created_at?: string;
}

/** Discriminated result returned by every action (errors never throw). */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const METER_LOGS_TABLE = "meter_logs";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves a request-scoped Supabase client using the incoming cookies.
 * Returns `null` when the project is not configured so callers can fall back
 * to mock data instead of failing the whole render.
 */
async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  return createClient(await cookies());
}

function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Stores the RAW meter reading (actual display value, e.g. 4580 kWh) into
 * `meter_logs`. Delta units are NEVER persisted — they are always derived at
 * read-time by comparing against the cycle-start baseline reading.
 */
export async function logMeterReading(input: {
  readingValue: number;
  readingDate: string;
}): Promise<ActionResult<MeterLog>> {
  if (!Number.isFinite(input.readingValue) || input.readingValue < 0) {
    return { ok: false, error: "readingValue must be a non-negative number." };
  }
  if (!ISO_DATE_PATTERN.test(input.readingDate)) {
    return { ok: false, error: "readingDate must be formatted as YYYY-MM-DD." };
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return { ok: false, error: "Supabase is not configured." };
    }

    const { data, error } = await supabase
      .from(METER_LOGS_TABLE)
      .insert({
        reading_value: input.readingValue,
        reading_date: input.readingDate,
      })
      .select("id, reading_value, reading_date, created_at")
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

    const { data, error } = await supabase
      .from(METER_LOGS_TABLE)
      .select("id, reading_value, reading_date, created_at")
      .gte("reading_date", cycleStartIso)
      .order("reading_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);

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

    const { data, error } = await supabase
      .from(METER_LOGS_TABLE)
      .select("id, reading_value, reading_date, created_at")
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

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
    const { data, error } = await supabase
      .from(METER_LOGS_TABLE)
      .select("id, reading_value, reading_date, created_at")
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as MeterLog[] };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}

