"use client";

import { useState } from "react";

import { motion } from "framer-motion";
import { Plus, TriangleAlert } from "lucide-react";

import GaugeMeter from "@/components/dashboard/GaugeMeter";
import KpiCards from "@/components/dashboard/KpiCards";
import RecentLogs from "@/components/dashboard/RecentLogs";
import Header from "@/components/layout/Header";
import AddReadingModal from "@/components/meter/AddReadingModal";

import { DASHBOARD, MOCK_READINGS } from "@/lib/mock-data";
import { ZONE_META, getConsumptionZone, getDeltaZone } from "@/lib/tariff";
import type { MeterReadingEntry, ReadingSubmission } from "@/lib/types";
import { cn } from "@/lib/utils";

const SECTION_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function DashboardPage() {
  const [consumedUnits, setConsumedUnits] = useState(DASHBOARD.consumedUnits);
  const [entries, setEntries] = useState<MeterReadingEntry[]>(MOCK_READINGS);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const latestEntry = entries[0];
  const zone = getConsumptionZone(consumedUnits);
  const zoneMeta = ZONE_META[zone];
  const remaining = DASHBOARD.targetLimit - consumedUnits;

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
    setConsumedUnits(submission.meterValue);
  }

  return (
    <div className="relative min-h-screen">
      <Header />

      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6 md:pb-14 lg:px-8">
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
              Billing cycle {DASHBOARD.cycleLabel} · {DASHBOARD.daysLeft} days
              left
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
                consumedUnits={consumedUnits}
                targetLimit={DASHBOARD.targetLimit}
              />
            </div>

            {/* Projection alert */}
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-600/40 bg-amber-600/10 p-3.5">
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-amber-100/90">
                Projected to hit{" "}
                <span className="font-semibold text-white">186 units</span> by{" "}
                {DASHBOARD.cycleEndLabel} — past the critical slab. Cut about{" "}
                <span className="font-semibold text-white">2.2 units/day</span>{" "}
                to land inside the safe zone.
              </p>
            </div>
          </motion.section>

          {/* KPI tiles */}
          <section
            aria-label="Key performance indicators"
            className="lg:col-span-7"
          >
            <KpiCards />
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
        onSubmit={handleReadingSubmit}
      />
    </div>
  );
}

