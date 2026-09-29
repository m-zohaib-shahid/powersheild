import type { LucideIcon } from "lucide-react";

import type { MeterMetrics } from "./burn-rate";

/**
 * Zone classification for cumulative consumption inside a billing cycle.
 * safe     -> fewer than 160 units
 * warning  -> 160 to 179 units
 * critical -> 180 units or more
 */
export type ConsumptionZone = "safe" | "warning" | "critical";

/** Accent palette tokens mapped to the LESCO-inspired theme. */
export type ZoneTone = "emerald" | "amber" | "red";

/** Presentational metadata for a consumption zone (colors + labels). */
export interface ZoneMeta {
  zone: ConsumptionZone;
  /** Short badge label, e.g. "Safe". */
  label: string;
  /** Long badge label used inside the gauge, e.g. "Safe zone". */
  fullLabel: string;
  /** Hex color for SVG strokes/fills (exact design-system accent). */
  hex: string;
  /** Tailwind class for readable foreground text. */
  text: string;
  /** Tailwind class for tinted surfaces. */
  bg: string;
  /** Tailwind class for tinted borders. */
  border: string;
  /** Human readable unit range, e.g. "160 - 179 units". */
  range: string;
}

export interface GaugeMeterProps {
  /** Units consumed so far in the billing cycle (derived delta). */
  consumedUnits: number;
  /** Slab target limit for the cycle (defaults to 200 in the dashboard). */
  targetLimit: number;
  /** Status zone override (projected-units zoning from the burn engine). */
  zone?: ConsumptionZone;
  /** Raw cycle-start baseline in kWh, e.g. 4400 (renders the subtext). */
  baseReading?: number;
  /** Raw current meter index in kWh, e.g. 4580 (renders the subtext). */
  meterReading?: number;
  /** Optional class merged onto the component root. */
  className?: string;
}

export type KpiTone = ZoneTone | "sky";

/** A single stat tile rendered by `KpiCards`. */
export interface KpiCardItem {
  id: string;
  label: string;
  value: string;
  unit: string;
  caption: string;
  icon: LucideIcon;
  tone: KpiTone;
}

export interface KpiCardsProps {
  /** Computed snapshot from the burn-rate engine (renders live values). */
  metrics?: MeterMetrics;
  /** Static fallback cards used when no metrics are supplied. */
  items?: KpiCardItem[];
  className?: string;
}

/** A historical meter submission rendered by `RecentLogs`. */
export interface MeterReadingEntry {
  id: string;
  /** ISO calendar date in YYYY-MM-DD format. */
  date: string;
  /**
   * Optional ISO timestamp the reading was logged (used by
   * `RecentReadingsTable` for the "Sep 28, 2026 - 08:30 PM" label). Absent
   * for older rows, which fall back to the date alone.
   */
  loggedAt?: string;
  /** Cumulative meter index at the time of the reading. */
  reading: number;
  /** Units burned since the previous reading. */
  delta: number;
  /** Status badge derived from the daily delta. */
  zone: ConsumptionZone;
}

export interface RecentLogsProps {
  entries?: MeterReadingEntry[];
  className?: string;
}

export interface HeaderUser {
  name: string;
  initials: string;
}

export interface HeaderProps {
  user?: HeaderUser;
  className?: string;
}

/** Payload produced when a user saves a reading from the modal. */
export interface ReadingSubmission {
  meterValue: number;
  readingDate: string;
  source: "manual" | "ocr";
}

export interface AddReadingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Latest raw meter index; lower readings fail validation (e.g. 4580). */
  previousReading?: number;
  /** ISO date of the latest reading, shown as helper context. */
  previousReadingDate?: string;
  /** Cycle-start baseline (kWh) used for the consumed-since-baseline preview. */
  cycleStartReading?: number;
  onSubmit?: (submission: ReadingSubmission) => void;
}

/**
 * Props for the live camera OCR scanner component.
 * `isActive` drives the webcam lifecycle: the stream starts only while the
 * scanner is visible and every track is stopped the moment it becomes false
 * (modal close / tab switch) or the component unmounts.
 */
export interface OcrScannerProps {
  /** Whether the camera feed should be running right now. */
  isActive: boolean;
  /** Called with a snapshot file captured from the live video feed. */
  onCapture?: (file: File) => void;
  /** Optional class merged onto the viewfinder root element. */
  className?: string;
}

/**
 * Static dashboard snapshot powering the mock UI. `currentReading` and
 * `cycleStartReading` are RAW cumulative meter indices (kWh) — never deltas.
 */
export interface DashboardSnapshot {
  /** Actual meter display value logged today (e.g. 4580 kWh). */
  currentReading: number;
  /** Meter value captured at the start of the billing cycle (e.g. 4400). */
  cycleStartReading: number;
  /** Day of month (1-31) the billing cycle resets on. */
  billingCycleDay: number;
  /** Slab target limit in units for the cycle. */
  targetLimit: number;
  lastUpdated: string;
}
