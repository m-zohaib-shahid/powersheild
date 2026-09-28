"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { motion } from "framer-motion";
import { Plus, Info, TriangleAlert, CircleCheck, Settings2 } from "lucide-react";

import GaugeMeter from "@/components/dashboard/GaugeMeter";
import KpiCards from "@/components/dashboard/KpiCards";
import RecentLogs from "@/components/dashboard/RecentLogs";
import Header from "@/components/layout/Header";
import AddReadingModal from "@/components/meter/AddReadingModal";

import { logMeterReading, updateBillingCycleDay } from "@/app/actions/meter";
import CycleSettingsModal from "@/components/dashboard/CycleSettingsModal";
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
  const [isCycleSettingsOpen, setIsCycleSettingsOpen] = useState(false);
  const [billingCycleDay, setBillingCycleDay] = useState(
    initialData.snapshot.billingCycleDay,
  );
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
        billingCycleDay,
        targetUnitLimit: initialData.snapshot.targetLimit,
      }),
    [
      currentReading,
      initialData.snapshot.cycleStartReading,
      billingCycleDay,
      initialData.snapshot.targetLimit,
    ],
  );

  /**
   * Persists the billing anchor to the Supabase `profiles` table via the
   * server action (which revalidates the route), then refreshes the RSC
   * payload so the 30-day window and every projection re-render.
   *
   * On failure the previous value is restored so the UI never shows a value
   * the database did not accept.
   */
  async function handleCycleDaySave(day: number): Promise<boolean> {
    /* Optimistically reflect the change so the UI feels instant. */
    setBillingCycleDay(day);

    const result = await updateBillingCycleDay(day);

    if (!result.ok) {
      setSaveState("error");
      setSaveError(result.error);
      /* Roll back to the last server-confirmed value. */
      setBillingCycleDay(initialData.snapshot.billingCycleDay);
      return false;
    }

    /* Keep the local mirror in sync for the anonymous/demo path. */
    window.localStorage.setItem("powershield.billingCycleDay", String(day));

    setSaveState("saved");
    setSaveError(null);
    window.setTimeout(() => setSaveState("idle"), 3000);

    /* The action already called revalidatePath; this pushes the fresh RSC
       payload into the client so the banner updates immediately. */
    router.refresh();
    return true;
  }

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
              Billing cycle {formatReadingDate(metrics.cycleStartDate)} -{" "}
              {formatReadingDate(metrics.cycleEndDate)} ·{" "}
              {metrics.daysRemaining} days left
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/*
              Billing cycle badge - visually distinct from the primary action
              and self-documenting: a hover/focus tooltip reveals the exact
              30-day window so the anchor day is never ambiguous.
            */}
            <span className="group relative inline-flex">
              <button
                type="button"
                onClick={() => setIsCycleSettingsOpen(true)}
                aria-label={`Change billing cycle start day. Current cycle runs from ${formatReadingDate(metrics.cycleStartDate)} to ${formatReadingDate(metrics.cycleEndDate)}.`}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-600/40 bg-emerald-600/10 px-3 py-2.5 text-sm font-semibold text-emerald-300 transition hover:border-emerald-500/60 hover:bg-emerald-600/20 hover:text-emerald-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  Cycle Day {billingCycleDay}
                </span>
                <span className="sm:hidden">{billingCycleDay}</span>
              </button>

              {/* Tooltip - exact start/end dates for the active window */}
              <span
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-max max-w-[16rem] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-[11px] leading-relaxed text-slate-300 opacity-0 shadow-xl shadow-black/50 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <span className="block font-semibold text-white">
                  {formatReadingDate(metrics.cycleStartDate)} &rarr;{" "}
                  {formatReadingDate(metrics.cycleEndDate)}
                </span>
                <span className="mt-0.5 block text-slate-400">
                  Day {metrics.daysElapsed} of 30 &middot;{" "}
                  {metrics.daysRemaining} days left
                </span>
              </span>
            </span>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="hidden items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-fab transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:inline-flex"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Reading
          </button>
          </div>
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

      {/* Billing cycle configuration */}
      <CycleSettingsModal
        isOpen={isCycleSettingsOpen}
        onClose={() => setIsCycleSettingsOpen(false)}
        currentDay={billingCycleDay}
        userName={initialData.isLive ? undefined : "Demo mode"}
        onSave={handleCycleDaySave}
      />
    </div>
  );
}

