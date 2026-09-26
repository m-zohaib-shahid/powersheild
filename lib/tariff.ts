import type { ConsumptionZone, ZoneMeta } from "./types";

/* ---------------------------------------------------------------
 * Slab thresholds — LESCO-style safeguard rules
 * ------------------------------------------------------------- */
export const TARGET_LIMIT = 200;
export const WARNING_THRESHOLD = 160; // >= 160 units => warning zone
export const CRITICAL_THRESHOLD = 180; // >= 180 units => critical zone
export const CYCLE_DAYS = 30;

/* Daily delta bands used for per-entry status badges */
export const DELTA_WARNING_THRESHOLD = 5.5;
export const DELTA_CRITICAL_THRESHOLD = 6.5;

export const CONSUMPTION_ZONES: readonly ConsumptionZone[] = [
  "safe",
  "warning",
  "critical",
] as const;

/** Exact accent hex values from the design system. */
export const ZONE_HEX: Record<ConsumptionZone, string> = {
  safe: "#059669", // emerald-600
  warning: "#D97706", // amber-600
  critical: "#DC2626", // red-600
};

/** Class + label metadata for every zone. */
export const ZONE_META: Record<ConsumptionZone, ZoneMeta> = {
  safe: {
    zone: "safe",
    label: "Safe",
    fullLabel: "Safe zone",
    hex: ZONE_HEX.safe,
    text: "text-emerald-400",
    bg: "bg-emerald-600/15",
    border: "border-emerald-600/40",
    range: "< 160 units",
  },
  warning: {
    zone: "warning",
    label: "Warning",
    fullLabel: "Warning zone",
    hex: ZONE_HEX.warning,
    text: "text-amber-400",
    bg: "bg-amber-600/15",
    border: "border-amber-600/40",
    range: "160 - 179 units",
  },
  critical: {
    zone: "critical",
    label: "Critical",
    fullLabel: "Critical zone",
    hex: ZONE_HEX.critical,
    text: "text-red-400",
    bg: "bg-red-600/15",
    border: "border-red-600/40",
    range: ">= 180 units",
  },
};

/** Maps cumulative cycle consumption onto a safeguard zone. */
export function getConsumptionZone(units: number): ConsumptionZone {
  if (units >= CRITICAL_THRESHOLD) return "critical";
  if (units >= WARNING_THRESHOLD) return "warning";
  return "safe";
}

/** Maps a single day's burn (delta) onto a status badge. */
export function getDeltaZone(delta: number): ConsumptionZone {
  if (delta >= DELTA_CRITICAL_THRESHOLD) return "critical";
  if (delta >= DELTA_WARNING_THRESHOLD) return "warning";
  return "safe";
}
