"use client";

import { useEffect, useState } from "react";

import { motion } from "framer-motion";
import { Plus, Info, TriangleAlert } from "lucide-react";

import GaugeMeter from "@/components/dashboard/GaugeMeter";
import KpiCards from "@/components/dashboard/KpiCards";
import RecentLogs from "@/components/dashboard/RecentLogs";
import Header from "@/components/layout/Header";
import AddReadingModal from "@/components/meter/AddReadingModal";

import { calculateMeterMetrics } from "@/lib/burn-rate";
import { DASHBOARD, MOCK_READINGS } from "@/lib/mock-data";
import { ZONE_META, getDeltaZone } from "@/lib/tariff";
import type { MeterReadingEntry, ReadingSubmission } from "@/lib/types";
import { cn, formatMeterValue, formatReadingDate } from "@/lib/utils";

const SECTION_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [currentReading, setCurrentReading] = useState(
    DASHBOARD.currentReading,
  );
  const [entries, setEntries] = useState<MeterReadingEntry[]>(MOCK_READINGS);
  const [isModalOpen, setIsModalOpen] = useState(false);

  /* Client hydration guard: SSR and the first paint render the skeleton,
     then the interactive dashboard swaps in — no blank flashes or jitter. */
  useEffect(() => {
    setMounted(true);
  }, []);

  const latestEntry = entries[0];

  /**
   * Local-only persistence: prepends the new reading and refreshes the
   * gauge. No network or database calls happen in this phase.
   */
  function handleReadingSubmit(submission: ReadingSubmission) {
    const delta = Number(
      (submission.meterValue - latestEntry.reading).toFixed(1),
    );

    const newEntry: MeterReadingEntry = {
      id: `reading-${Date.now()}`,
      date: submission.readingDate,
      reading: submission.meterValue,
      delta,
      zone: getDeltaZone(delta),
    };

    setEntries((previous) => [newEntry, ...previous]);
    setCurrentReading(submission.meterValue);
  }

  /* Hydration guard: the live dashboard only ever renders client-side. */
  if (!mounted) {
    return <DashboardSkeleton />;
  }

  /* Cumulative-meter analytics: raw readings in, deltas/projections out. */
  const metrics = calculateMeterMetrics({
    currentReading,
    cycleStartReading: DASHBOARD.cycleStartReading,
    billingCycleDay: DASHBOARD.billingCycleDay,
    targetUnitLimit: DASHBOARD.targetLimit,
  });
  const zoneMeta = ZONE_META[metrics.zone];
  const remaining = DASHBOARD.targetLimit - metrics.unitsConsumed;

  /* Zone-aware styling for the projection callout. */
  const alertTone =
    metrics.zone === "critical"
      ? "border-red-600/40 bg-red-600/10"
      : metrics.zone === "warning"
        ? "border-amber-600/40 bg-amber-600/10"
        : "border-emerald-600/40 bg-emerald-600/10";

  return (
    <div className="relative min-h-screen">
      <Header />

      {/* pb-32 keeps the fixed mobile FAB clear of the last recent-log entry */}
      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6 md:pb-16 lg:px-8">
        {/* Page heading + desktop action */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              Live load guard
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Tariff Safeguard Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Billing cycle {formatReadingDate(metrics.cycleStartDate)} –{" "}
              {formatReadingDate(metrics.cycleEndDate)} ·{" "}
              {metrics.daysRemaining} days left
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="hidden items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-fab transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:inline-flex"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Reading
          </button>
        </div>

        {/* Responsive dashboard grid */}
        <div className="grid gap-5 lg:grid-cols-12">
          {/* Gauge card */}
          <motion.section
            aria-labelledby="gauge-heading"
            className="card-surface p-5 sm:p-6 lg:col-span-5"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: SECTION_EASE }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="gauge-heading"
                  className="text-sm font-semibold uppercase tracking-wider text-slate-300"
                >
                  Units Consumed
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Updated {DASHBOARD.lastUpdated}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
                  zoneMeta.bg,
                  zoneMeta.border,
                  zoneMeta.text,
                )}
              >
                {remaining >= 0
                  ? `${remaining} left`
                  : `${Math.abs(remaining)} over`}
              </span>
            </div>

            <div className="mt-5">
              <GaugeMeter
                consumedUnits={metrics.unitsConsumed}
                targetLimit={DASHBOARD.targetLimit}
                zone={metrics.zone}
                baseReading={DASHBOARD.cycleStartReading}
                meterReading={currentReading}
              />
            </div>

            {/* Zone-aware projection callout (computed live by the engine) */}
            <div
              className={cn(
                "mt-6 flex items-start gap-3 rounded-xl border p-3.5",
                alertTone,
              )}
            >
              {metrics.zone === "safe" ? (
                <Info
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <TriangleAlert
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    metrics.zone === "warning"
                      ? "text-amber-400"
                      : "text-red-400",
                  )}
                  aria-hidden="true"
                />
              )}
              <p className="text-xs leading-relaxed">
                Projected to hit{" "}
                <span className="font-semibold text-white">
                  {formatMeterValue(metrics.projectedUnits)} units
                </span>{" "}
                by {formatReadingDate(metrics.cycleEndDate)} with{" "}
                {metrics.daysRemaining} days left. Stay under{" "}
                <span className="font-semibold text-white">
                  {formatMeterValue(metrics.recommendedDailyCap)} units/day
                </span>{" "}
                to finish inside the {DASHBOARD.targetLimit}-unit slab.
              </p>
            </div>
          </motion.section>

          {/* KPI tiles */}
          <section
            aria-label="Key performance indicators"
            className="lg:col-span-7"
          >
            <KpiCards metrics={metrics} />
          </section>

          {/* Reading history */}
          <RecentLogs entries={entries} className="lg:col-span-12" />
        </div>
      </main>

      {/* Sticky mobile floating action button */}
      <motion.button
        type="button"
        onClick={() => setIsModalOpen(true)}
        aria-label="Add a new meter reading"
        initial={{ y: 96, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.65, type: "spring", stiffness: 300, damping: 24 }}
        whileTap={{ scale: 0.96 }}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-fab ring-1 ring-emerald-400/30 transition-colors hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 md:hidden"
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        Add Reading
      </motion.button>

      {/* Reading capture dialog */}
      <AddReadingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        previousReading={latestEntry.reading}
        previousReadingDate={latestEntry.date}
        cycleStartReading={DASHBOARD.cycleStartReading}
        onSubmit={handleReadingSubmit}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Pre-mount skeleton — mirrors the live layout (header, heading, gauge card,
 * 2x2 KPI grid and five log rows) so swapping in the dashboard causes zero
 * layout shift. Dark-slate tokens only; pure presentational.
 * ------------------------------------------------------------------------- */

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-slate-700/40", className)}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="relative min-h-screen"
      role="status"
      aria-label="Loading dashboard"
    >
      {/* Header placeholder */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-700/70 bg-slate-900/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <SkeletonBlock className="h-8 w-8 rounded-xl" />
            <SkeletonBlock className="h-5 w-28 rounded-md" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <SkeletonBlock className="h-6 w-24 rounded-full" />
            <SkeletonBlock className="h-8 w-8 rounded-full sm:w-32" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6 md:pb-16 lg:px-8">
        {/* Heading placeholder */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <SkeletonBlock className="h-3 w-32 rounded-full" />
            <SkeletonBlock className="mt-3 h-8 w-72 max-w-full rounded-xl" />
            <SkeletonBlock className="mt-3 h-4 w-56 rounded-md" />
          </div>
          <SkeletonBlock className="hidden h-10 w-36 rounded-xl md:block" />
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
          {/* Gauge card placeholder */}
          <div className="card-surface p-5 sm:p-6 lg:col-span-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="mt-2 h-3 w-40 rounded-md" />
              </div>
              <SkeletonBlock className="h-6 w-16 rounded-full" />
            </div>
            <div className="mt-5 flex justify-center">
              <SkeletonBlock className="aspect-square w-full max-w-[264px] rounded-full" />
            </div>
            <SkeletonBlock className="mx-auto mt-6 h-4 w-64 max-w-full rounded-md" />
            <div className="mt-4 flex items-center justify-center gap-4">
              <SkeletonBlock className="h-3 w-20 rounded-full" />
              <SkeletonBlock className="h-3 w-24 rounded-full" />
              <SkeletonBlock className="h-3 w-20 rounded-full" />
            </div>
          </div>

          {/* KPI tiles placeholder (2x2 matches the live grid) */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-7">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-700 bg-slate-800/80 p-4 backdrop-blur-xl sm:p-5"
              >
                <SkeletonBlock className="h-10 w-10 rounded-xl" />
                <SkeletonBlock className="mt-4 h-3 w-24" />
                <SkeletonBlock className="mt-2.5 h-6 w-20 rounded-md" />
                <SkeletonBlock className="mt-2.5 h-3 w-28 rounded-md" />
              </div>
            ))}
          </div>

          {/* Recent logs placeholder */}
          <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/80 shadow-card backdrop-blur-xl lg:col-span-12">
            <div className="flex items-center justify-between gap-3 border-b border-slate-700/70 px-4 py-4 sm:px-5">
              <div>
                <SkeletonBlock className="h-4 w-36" />
                <SkeletonBlock className="mt-2 h-3 w-52 rounded-md" />
              </div>
              <SkeletonBlock className="h-6 w-20 rounded-full" />
            </div>
            <ul className="divide-y divide-slate-700/60">
              {[0, 1, 2, 3, 4].map((row) => (
                <li
                  key={row}
                  className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
                >
                  <SkeletonBlock className="h-9 w-9 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <SkeletonBlock className="h-4 w-32" />
                    <SkeletonBlock className="mt-2 h-3 w-44 rounded-md" />
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <SkeletonBlock className="h-4 w-20 rounded-md" />
                    <SkeletonBlock className="h-4 w-14 rounded-full" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

