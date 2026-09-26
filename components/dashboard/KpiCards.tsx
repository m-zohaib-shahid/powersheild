"use client";

import { motion } from "framer-motion";

import type { KpiCardsProps, KpiTone } from "@/lib/types";
import { MOCK_KPI_CARDS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

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

export default function KpiCards({
  items = MOCK_KPI_CARDS,
  className,
}: KpiCardsProps) {
  return (
    <motion.div
      className={cn("grid grid-cols-2 gap-3 sm:gap-4", className)}
      variants={GRID_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      {items.map((item) => {
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
  );
}
