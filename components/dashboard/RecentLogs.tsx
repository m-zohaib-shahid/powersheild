import { Activity, Gauge, TrendingDown, TrendingUp } from "lucide-react";

import type { RecentLogsProps } from "@/lib/types";
import { MOCK_READINGS } from "@/lib/mock-data";
import { ZONE_META } from "@/lib/tariff";
import { cn, formatReadingDate } from "@/lib/utils";

export default function RecentLogs({
  entries = MOCK_READINGS,
  className,
}: RecentLogsProps) {
  return (
    <section
      aria-labelledby="recent-logs-heading"
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/80 shadow-card backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-700/70 px-4 py-4 sm:px-5">
        <div>
          <h2
            id="recent-logs-heading"
            className="text-sm font-semibold uppercase tracking-wider text-slate-300"
          >
            Recent Readings
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Meter logbook for the current billing cycle
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-[11px] font-medium text-slate-400">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/60">
            <Activity className="h-5 w-5 text-slate-500" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-slate-300">
            No readings yet
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-slate-500">
            Add your first meter reading to start tracking burn rate and slab
            projections.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-700/60">
          {entries.map((entry) => {
            const meta = ZONE_META[entry.zone];
            const isRising = entry.delta >= 0;

            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-slate-700/25 sm:px-5"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                    meta.bg,
                    meta.border,
                  )}
                >
                  <Gauge className={cn("h-4 w-4", meta.text)} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {formatReadingDate(entry.date)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    Meter reading{" "}
                    <span className="font-medium tabular-nums text-slate-300">
                      {entry.reading.toFixed(1)}
                    </span>{" "}
                    units
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-slate-200">
                    {isRising ? (
                      <TrendingUp
                        className={cn("h-3.5 w-3.5", meta.text)}
                        aria-hidden="true"
                      />
                    ) : (
                      <TrendingDown
                        className={cn("h-3.5 w-3.5", meta.text)}
                        aria-hidden="true"
                      />
                    )}
                    {isRising ? "+" : ""}
                    {entry.delta.toFixed(1)}
                    <span className="text-[11px] font-medium text-slate-500">
                      units
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      meta.bg,
                      meta.border,
                      meta.text,
                    )}
                  >
                    {meta.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
