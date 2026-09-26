import { Calendar, ShieldAlert, TrendingUp, Zap } from "lucide-react";

import { getDeltaZone } from "./tariff";
import type {
  DashboardSnapshot,
  HeaderUser,
  KpiCardItem,
  MeterReadingEntry,
} from "./types";

/** Signed-in demo user rendered in the header avatar pill. */
export const MOCK_USER: HeaderUser = {
  name: "Ali Raza",
  initials: "AR",
};

/** Static cycle snapshot powering the dashboard mock. */
export const DASHBOARD: DashboardSnapshot = {
  consumedUnits: 142,
  targetLimit: 200,
  cycleLabel: "10 Sep - 09 Oct 2026",
  cycleEndLabel: "09 Oct 2026",
  daysLeft: 12,
  lastUpdated: "27 Sep 2026, 9:40 PM",
};

/**
 * Five most recent meter entries (newest first).
 * Chain check: 112.8 -> 118.0 -> 124.9 -> 129.8 -> 135.6 -> 142.0
 */
export const MOCK_READINGS: MeterReadingEntry[] = [
  {
    id: "reading-5",
    date: "2026-09-27",
    reading: 142.0,
    delta: 6.4,
    zone: getDeltaZone(6.4),
  },
  {
    id: "reading-4",
    date: "2026-09-26",
    reading: 135.6,
    delta: 5.8,
    zone: getDeltaZone(5.8),
  },
  {
    id: "reading-3",
    date: "2026-09-25",
    reading: 129.8,
    delta: 4.9,
    zone: getDeltaZone(4.9),
  },
  {
    id: "reading-2",
    date: "2026-09-24",
    reading: 124.9,
    delta: 6.9,
    zone: getDeltaZone(6.9),
  },
  {
    id: "reading-1",
    date: "2026-09-23",
    reading: 118.0,
    delta: 5.2,
    zone: getDeltaZone(5.2),
  },
];

/** The four KPI tiles specified for the dashboard. */
export const MOCK_KPI_CARDS: KpiCardItem[] = [
  {
    id: "daily-burn-rate",
    label: "Daily Burn Rate",
    value: "6.2",
    unit: "Units/Day",
    caption: "7-day rolling average",
    icon: Zap,
    tone: "amber",
  },
  {
    id: "projected-month-end",
    label: "Projected Month-End",
    value: "186",
    unit: "Units",
    caption: `Trending past the critical slab`,
    icon: TrendingUp,
    tone: "red",
  },
  {
    id: "recommended-daily-cap",
    label: "Recommended Daily Cap",
    value: "4.1",
    unit: "Units/Day",
    caption: "Recalculated after every reading",
    icon: ShieldAlert,
    tone: "emerald",
  },
  {
    id: "days-left",
    label: "Days Left in Cycle",
    value: "12",
    unit: "Days",
    caption: `Cycle ends ${DASHBOARD.cycleEndLabel}`,
    icon: Calendar,
    tone: "sky",
  },
];
