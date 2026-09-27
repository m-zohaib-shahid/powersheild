"use client";

import { motion } from "framer-motion";
import { Calendar, ShieldAlert, TrendingUp, Zap } from "lucide-react";

import type { KpiCardItem, KpiCardsProps, KpiTone } from "@/lib/types";
import type { MeterMetrics } from "@/lib/burn-rate";
import { CYCLE_LENGTH_DAYS } from "@/lib/burn-rate";
import { MOCK_KPI_CARDS } from "@/lib/mock-data";
import { cn, formatReadingDate, formatUnits } from "@/lib/utils";

/** Tone tokens per accent color used by the stat tiles. */
const TONE_STYLES: Record<
  KpiTone,
  { iconBox: string; icon: string; glow: string }
> = {
  emerald: {
    iconBox: "border-emerald-600/30 bg-emerald-600/10",
    icon: "text-emerald-400",
    glow: "from-emerald-600/25",
  },
  amber: {
    iconBox: "border-amber-600/30 bg-amber-600/10",
    icon: "text-amber-400",
    glow: "from-amber-600/25",
  },
  red: {
    iconBox: "border-red-600/30 bg-red-600/10",
    icon: "text-red-400",
    glow: "from-red-600/25",
  },
  sky: {
    iconBox: "border-sky-600/30 bg-sky-600/10",
    icon: "text-sky-400",
    glow: "from-sky-600/25",
  },
};

const GRID_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
} as const;

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
} as const;

/** Builds the four KPI tiles from the live burn-rate engine snapshot. */
function buildMetricItems(metrics: MeterMetrics): KpiCardItem[] {
  const burnTone: KpiTone =
    metrics.dailyBurnRate > metrics.recommendedDailyCap ? "amber" : "emerald";
  const zoneTone: KpiTone =
    metrics.zone === "safe"
      ? "emerald"
      : metrics.zone === "warning"
        ? "amber"
        : "red";
  const projectionCaption =
    metrics.zone === "safe"
      ? "Inside the safe slab"
      : metrics.zone === "warning"
        ? "Nearing the critical slab"
        : "Past the critical slab";

  return [
    {
      id: "daily-burn-rate",
      label: "Daily Burn Rate",
      value: formatUnits(metrics.dailyBurnRate, 1),
      unit: "Units/Day",
      caption: `Avg over ${metrics.daysElapsed} days this cycle`,
      icon: Zap,
      tone: burnTone,
    },
    {
      id: "projected-month-end",
      label: "Projected Month-End",
      value: formatUnits(Math.round(metrics.projectedUnits), 0),
      unit: "Units",
      caption: projectionCaption,
      icon: TrendingUp,
      tone: zoneTone,
    },
    {
      id: "recommended-daily-cap",
      label: "Recommended Daily Cap",
      value: formatUnits(metrics.recommendedDailyCap, 1),
      unit: "Units/Day",
      caption: "Remaining slab budget ÷ days left",
      icon: ShieldAlert,
      tone: "emerald",
    },
    {
      id: "days-left",
      label: "Days Left in Cycle",
      value: String(metrics.daysRemaining),
      unit: "Days",
      caption: `Cycle ends ${formatReadingDate(metrics.cycleEndDate)}`,
      icon: Calendar,
      tone: "sky",
    },
  ];
}

/**
 * Compact cycle header shown above the KPI grid: the active 30-day window and
 * a progress bar for the days consumed so far. Rendered only when live metrics
 * are available (the mock card list has no cycle context).
 */
function CycleProgressBanner({ metrics }: { metrics: MeterMetrics }) {
  /* Clamp to 0-1 so the bar can never overflow its track. */
  const progress = Math.min(Math.max(metrics.cycleProgress, 0), 1);
  const percent = Math.round(progress * 100);
  const isEnding = metrics.daysRemaining <= 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mb-3 rounded-2xl border border-slate-700 bg-slate-800/80 p-4 shadow-card backdrop-blur-xl sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Active Cycle:{" "}
          <span className="text-white">
            {formatReadingDate(metrics.cycleStartDate)} -{" "}
            {formatReadingDate(metrics.cycleEndDate)}
          </span>
        </p>
        <p className="text-xs font-semibold tabular-nums text-slate-300">
          Day{" "}
          <span className={isEnding ? "text-amber-400" : "text-white"}>
            {metrics.daysElapsed}
          </span>{" "}
          of {CYCLE_LENGTH_DAYS}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={metrics.daysElapsed}
        aria-valuemin={1}
        aria-valuemax={CYCLE_LENGTH_DAYS}
        aria-label="Cycle days elapsed"
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-700/70"
      >
        <motion.div
          className={cn(
            "h-full rounded-full",
            isEnding
              ? "bg-gradient-to-r from-amber-500 to-amber-400"
              : "bg-gradient-to-r from-emerald-600 to-emerald-400",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        />
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        {metrics.daysElapsed} of {CYCLE_LENGTH_DAYS} days elapsed ({percent}%)
        · {metrics.daysRemaining} days remaining
      </p>
    </motion.div>
  );
}

export default function KpiCards({
  metrics,
  items = MOCK_KPI_CARDS,
  className,
}: KpiCardsProps) {
  const cards = metrics ? buildMetricItems(metrics) : items;

  return (
    <div>
      {metrics && <CycleProgressBanner metrics={metrics} />}

      <motion.div
        className={cn("grid grid-cols-2 gap-3 sm:gap-4", className)}
        variants={GRID_VARIANTS}
        initial="hidden"
        animate="visible"
      >
      {cards.map((item) => {
        const tone = TONE_STYLES[item.tone];
        const Icon = item.icon;

        return (
          <motion.article
            key={item.id}
            variants={CARD_VARIANTS}
            className="group relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/80 p-4 shadow-card backdrop-blur-xl transition-colors duration-300 hover:border-slate-600 sm:p-5"
          >
            {/* Glassmorphism glow accent */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70",
                tone.glow,
              )}
            />

            <div className="relative flex items-start justify-between gap-2">
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl border",
                  tone.iconBox,
                )}
              >
                <Icon
                  className={cn("h-5 w-5", tone.icon)}
                  aria-hidden="true"
                />
              </span>
            </div>

            <p className="relative mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {item.label}
            </p>

            <p className="relative mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-2xl font-bold tabular-nums leading-none tracking-tight text-white sm:text-[26px]">
                {item.value}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {item.unit}
              </span>
            </p>

            <p className="relative mt-2 text-[11px] leading-relaxed text-slate-500">
              {item.caption}
            </p>
          </motion.article>
        );
      })}
      </motion.div>
    </div>
  );
}
