"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { GaugeMeterProps } from "@/lib/types";
import { CONSUMPTION_ZONES, ZONE_META, getConsumptionZone } from "@/lib/tariff";
import { cn, formatMeterValue } from "@/lib/utils";

/* Geometry of the circular meter (viewBox units) */
const VIEWBOX = 240;
const CENTER = VIEWBOX / 2;
const RADIUS = 100;
const TRACK_WIDTH = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const RING_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function GaugeMeter({
  consumedUnits,
  targetLimit,
  className,
}: GaugeMeterProps) {
  const prefersReducedMotion = useReducedMotion();

  const safeLimit = Math.max(targetLimit, 1);
  const rawRatio = consumedUnits / safeLimit;

  /* Overfill protection: ring + percentage stay within the 0..100% range so
     strokeDashoffset can never receive a negative value past 200 units. */
  const ratio = Math.min(Math.max(rawRatio, 0), 1);
  const percent = Math.min(Math.max(Math.round(rawRatio * 100), 0), 100);
  const dashOffset = Math.max(CIRCUMFERENCE * (1 - ratio), 0);

  const isOverLimit = consumedUnits > safeLimit;
  const zone = isOverLimit ? "critical" : getConsumptionZone(consumedUnits);
  const meta = ZONE_META[zone];
  const remaining = safeLimit - consumedUnits;

  const accessibilityLabel = `${formatMeterValue(
    consumedUnits,
  )} of ${safeLimit} units consumed, ${percent} percent of target, ${
    isOverLimit ? "overlimit" : meta.fullLabel.toLowerCase()
  }`;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative aspect-square w-full max-w-[264px]">
        {/* Zone-colored ambient glow behind the ring */}
        <span
          aria-hidden="true"
          className="absolute inset-8 rounded-full opacity-30 blur-3xl transition-colors duration-500"
          style={{ backgroundColor: meta.hex }}
        />

        <svg
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="relative h-full w-full"
          role="img"
          aria-label={accessibilityLabel}
        >
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            {/* Track */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="#1E293B"
              strokeWidth={TRACK_WIDTH}
            />
            {/* Inner dashed guide ring */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS - 24}
              fill="none"
              stroke="#334155"
              strokeWidth={1}
              strokeDasharray="2 6"
              strokeLinecap="round"
              opacity={0.7}
            />
            {/* Animated progress ring */}
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={meta.hex}
              strokeWidth={TRACK_WIDTH}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{ strokeDashoffset: CIRCUMFERENCE }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{
                duration: prefersReducedMotion ? 0 : 1.4,
                delay: prefersReducedMotion ? 0 : 0.2,
                ease: RING_EASE,
              }}
              style={{ filter: `drop-shadow(0 0 10px ${meta.hex}66)` }}
            />
          </g>
        </svg>

        {/* Center readout */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Consumed
          </span>
          <span className="mt-1 text-5xl font-bold tabular-nums leading-none tracking-tight text-white">
            {percent}
            <span className="text-2xl font-semibold text-slate-400">%</span>
          </span>
          <span className="mt-2 text-sm font-medium text-slate-400">
            <span className="font-semibold tabular-nums text-slate-100">
              {formatMeterValue(consumedUnits)}
            </span>{" "}
            / {safeLimit} units
          </span>
          {isOverLimit ? (
            <span className="mt-3 rounded-full border border-red-600 bg-red-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-md shadow-red-900/50">
              OVERLIMIT
            </span>
          ) : (
            <span
              className={cn(
                "mt-3 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                meta.bg,
                meta.border,
                meta.text,
              )}
            >
              {meta.fullLabel}
            </span>
          )}
        </div>
      </div>

      {/* Remaining allowance */}
      <p
        className={cn(
          "mt-5 text-xs font-medium",
          remaining >= 0 ? "text-slate-400" : "text-red-400",
        )}
      >
        {remaining >= 0 ? (
          <>
            <span className="font-semibold tabular-nums text-slate-200">
              {formatMeterValue(remaining, 0)}
            </span>{" "}
            units left before the {safeLimit}-unit limit
          </>
        ) : (
          <>
            <span className="font-semibold tabular-nums text-red-400">
              {formatMeterValue(Math.abs(remaining), 0)}
            </span>{" "}
            units over the {safeLimit}-unit limit
          </>
        )}
      </p>

      {/* Zone legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {CONSUMPTION_ZONES.map((zoneKey) => {
          const zoneInfo = ZONE_META[zoneKey];
          const isActive = zoneKey === zone;

          return (
            <span
              key={zoneKey}
              className={cn(
                "flex items-center gap-1.5 text-[11px] font-medium transition-colors duration-300",
                isActive ? zoneInfo.text : "text-slate-500",
              )}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: zoneInfo.hex,
                  opacity: isActive ? 1 : 0.55,
                }}
                aria-hidden="true"
              />
              {zoneInfo.label} · {zoneInfo.range}
            </span>
          );
        })}
      </div>
    </div>
  );
}
