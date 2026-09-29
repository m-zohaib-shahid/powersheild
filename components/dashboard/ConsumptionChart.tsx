"use client";

import { useId, useMemo } from "react";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

import { ZONE_META } from "@/lib/tariff";
import type { MeterReadingEntry } from "@/lib/types";
import { cn, formatMeterValue } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Consumption trend - dependency-free SVG chart.
 *
 * Hand-rolled rather than pulling in Recharts/Chart.js: the dataset is a
 * single short series, and a bespoke SVG keeps the bundle small and the visual
 * language identical to the rest of the dark-slate dashboard.
 * ------------------------------------------------------------------------- */

export interface ConsumptionChartProps {
  /** Reading rows (newest-first, as the dashboard stores them). */
  entries: MeterReadingEntry[];
  /** Slab limit, used to draw the 100% reference line. */
  targetLimit: number;
  /** Current running total, drawn as a filled area under the curve. */
  unitsConsumed: number;
  className?: string;
}

const VIEW_W = 640;
const VIEW_H = 180;
const PAD_X = 8;
const PAD_Y = 14;

export default function ConsumptionChart({
  entries,
  targetLimit,
  unitsConsumed,
  className,
}: ConsumptionChartProps) {
  const gradientId = useId();

  /**
   * Turns the raw rows into a cumulative series ending at the live total.
   * Entries are newest-first, so they are reversed to read left-to-right.
   * The final point is the authoritative `unitsConsumed` so the chart always
   * agrees with the gauge even if only the newest rows are loaded.
   */
  const points = useMemo(() => {
    const chronological = [...entries].reverse();

    const series = chronological.map((entry) => ({
      id: entry.id,
      label: entry.date,
      value: entry.reading,
    }));

    /* Always anchor the tail on the engine's total. */
    if (series.length === 0) {
      series.push({ id: "now", label: "", value: unitsConsumed });
    } else {
      series[series.length - 1] = {
        ...series[series.length - 1],
        value: unitsConsumed,
      };
    }

    const max = Math.max(targetLimit, unitsConsumed, 1);
    const stepX =
      series.length > 1
        ? (VIEW_W - PAD_X * 2) / (series.length - 1)
        : 0;

    const coords = series.map((point, index) => ({
      ...point,
      x: PAD_X + index * stepX,
      y:
        VIEW_H -
        PAD_Y -
        (Math.max(0, Math.min(point.value, max)) / max) * (VIEW_H - PAD_Y * 2),
    }));

    return {
      coords,
      line: coords
        .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
        .join(" "),
      area: `${coords
        .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
        .join(" ")} L${coords[coords.length - 1].x.toFixed(1)},${VIEW_H} L${coords[0].x.toFixed(1)},${VIEW_H} Z`,
      max,
    };
  }, [entries, unitsConsumed, targetLimit]);

  const limitY =
    VIEW_H -
    PAD_Y -
    ((Math.min(targetLimit, points.max) / points.max) * (VIEW_H - PAD_Y * 2));
  const tone = unitsConsumed >= targetLimit ? "red" : "emerald";
  const stroke = tone === "red" ? "#DC2626" : "#059669";

  return (
    <section
      aria-labelledby="trend-heading"
      className={cn(
        "rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-card backdrop-blur-xl sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="trend-heading"
            className="text-sm font-semibold uppercase tracking-wider text-slate-300"
          >
            Consumption Trend
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Cumulative units across the active billing cycle
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            ZONE_META[
              unitsConsumed >= targetLimit
                ? "critical"
                : unitsConsumed >= targetLimit * 0.8
                  ? "warning"
                  : "safe"
            ].bg,
            "border-slate-700",
          )}
        >
          <TrendingUp className="h-3 w-3" aria-hidden="true" />
          {Math.round((unitsConsumed / Math.max(targetLimit, 1)) * 100)}% of slab
        </span>
      </div>

      <div className="mt-4">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-40 w-full"
          role="img"
          aria-label={`Consumption trend: ${formatMeterValue(unitsConsumed)} units consumed of ${targetLimit} unit limit`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Slab limit reference line */}
          <line
            x1={PAD_X}
            x2={VIEW_W - PAD_X}
            y1={limitY}
            y2={limitY}
            stroke="#F43F5E"
            strokeWidth="1"
            strokeDasharray="5 5"
            opacity="0.5"
          />
          <text
            x={VIEW_W - PAD_X}
            y={limitY - 5}
            textAnchor="end"
            className="fill-rose-300/80"
            style={{ fontSize: "10px", fontWeight: 600 }}
          >
            {targetLimit}u limit
          </text>

          {/* Filled area + line */}
          <path d={points.area} fill={`url(#${gradientId})`} />
          <motion.path
            d={points.line}
            fill="none"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
          />

          {/* Latest point marker */}
          {points.coords.length > 0 && (
            <circle
              cx={points.coords[points.coords.length - 1].x}
              cy={points.coords[points.coords.length - 1].y}
              r="4"
              fill={stroke}
              stroke="#0F172A"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>
    </section>
  );
}