"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { motion } from "framer-motion";
import { Plus, Info, TriangleAlert, CircleCheck } from "lucide-react";

import GaugeMeter from "@/components/dashboard/GaugeMeter";
import KpiCards from "@/components/dashboard/KpiCards";
import RecentLogs from "@/components/dashboard/RecentLogs";
import Header from "@/components/layout/Header";
import AddReadingModal from "@/components/meter/AddReadingModal";

import { logMeterReading } from "@/app/actions/meter";
import { calculateMeterMetrics } from "@/lib/burn-rate";
import { ZONE_META, getDeltaZone } from "@/lib/tariff";
import type { DashboardData } from "@/lib/supabase-data";
import type { MeterReadingEntry, ReadingSubmission } from "@/lib/types";
import { cn, formatMeterValue, formatReadingDate } from "@/lib/utils";

const SECTION_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface DashboardViewProps {
  /** Server-fetched snapshot (falls back to mock data when Supabase is empty). */
  initialData: DashboardData;
}

export default function DashboardView({ initialData }: DashboardViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [currentReading, setCurrentReading] = useState(
    initialData.snapshot.currentReading,
  );
  const [entries, setEntries] = useState<MeterReadingEntry[]>(
    initialData.entries,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const latestEntry = entries[0];

  /**
   * Persists the raw meter index through the server action, then revalidates
   * the RSC payload so the gauge, KPIs and history all reflect the new
   * baseline math computed on the server.
   */
  function handleReadingSubmit(submission: ReadingSubmission) {
    const delta = Number(
      (submission.meterValue - latestEntry.reading).toFixed(1),
    );

    /* Optimistic update keeps the UI instant; `router.refresh()` reconciles
       the authoritative server-computed values a moment later. */
    setEntries((previous) => [
      {
        id: `pending-${Date.now()}`,
        date: submission.readingDate,
        reading: submission.meterValue,
        delta,
        zone: getDeltaZone(delta),
      },
      ...previous,
    ]);
    setCurrentReading(submission.meterValue);

    startTransition(async () => {
      const result = await logMeterReading(
        submission.meterValue,
        submission.readingDate,
      );

      if (result.ok) {
        setSaveState("saved");
        setSaveError(null);
        router.refresh();
        window.setTimeout(() => setSaveState("idle"), 3000);
      } else {
        setSaveState("error");
        setSaveError(result.error);
        /* Roll the optimistic row back on failure. */
        setEntries(initialData.entries);
        setCurrentReading(initialData.snapshot.currentReading);
      }
    });
  }

  /* Cumulative-meter analytics: raw readings in, deltas/projections out. */
  const metrics = useMemo(
    () =>
      calculateMeterMetrics({
        currentReading,
        cycleStartReading: initialData.snapshot.cycleStartReading,
        billingCycleDay: initialData.snapshot.billingCycleDay,
        targetUnitLimit: initialData.snapshot.targetLimit,
      }),
    [
      currentReading,
      initialData.snapshot.cycleStartReading,
      initialData.snapshot.billingCycleDay,
      initialData.snapshot.targetLimit,
    ],
  );

  const zoneMeta = ZONE_META[metrics.zone];
  const remaining = initialData.snapshot.targetLimit - metrics.unitsConsumed;

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

        {/* Save feedback banner */}
        {saveState !== "idle" && (
          <div
            role="status"
            className={cn(
              "mb-5 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm",
              saveState === "saved"
                ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-300"
                : "border-red-600/40 bg-red-600/10 text-red-300",
            )}
          >
            {saveState === "saved" ? (
              <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>
              {saveState === "saved"
                ? "Reading saved to Supabase."
                : `Could not save reading: ${saveError ?? "Unknown error"}`}
            </span>
          </div>
        )}

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
                  Updated {initialData.snapshot.lastUpdated}
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
                targetLimit={initialData.snapshot.targetLimit}
                zone={metrics.zone}
                baseReading={initialData.snapshot.cycleStartReading}
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
                to finish inside the {initialData.snapshot.targetLimit}-unit
                slab.
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
        {isPending ? "Saving…" : "Add Reading"}
      </motion.button>

      {/* Reading capture dialog */}
      <AddReadingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        previousReading={latestEntry.reading}
        previousReadingDate={latestEntry.date}
        cycleStartReading={initialData.snapshot.cycleStartReading}
        onSubmit={handleReadingSubmit}
      />
    </div>
  );
}

