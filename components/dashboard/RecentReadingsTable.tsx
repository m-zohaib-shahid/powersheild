"use client";

import { useMemo, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  Gauge,
  History,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { ZONE_META } from "@/lib/tariff";
import type { MeterReadingEntry } from "@/lib/types";
import { cn, formatMeterValue } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Reading History & Audit Log - low-profile management card.
 *
 * Designed to stay out of the way on mobile: the body is COLLAPSED by default
 * below `sm`, so it adds a single header row to the page instead of a long
 * scroll of logs. Expanding reveals vertical cards on small screens and a
 * proper aligned grid from `sm` up - never a horizontally scrolling table.
 * ------------------------------------------------------------------------- */

export interface RecentReadingsTableProps {
  /** Reading rows, newest first. */
  entries: MeterReadingEntry[];
  /** Id of the row that anchors the current cycle, badged "Cycle Start". */
  baselineId?: string | null;
  /** Starts expanded on larger screens (mobile still honours the toggle). */
  defaultExpanded?: boolean;
  onAdd?: () => void;
  /** Phase 2 wiring: local no-op for now. */
  onEdit?: (entry: MeterReadingEntry) => void;
  onDelete?: (entry: MeterReadingEntry) => void | Promise<void>;
  className?: string;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * "Sep 28, 2026 - 08:30 PM" from an ISO timestamp, falling back to the bare
 * date. Formatted by hand (not `toLocaleString`) so server and client render
 * identical text and React never reports a hydration mismatch.
 */
function formatStamp(date: string, loggedAt?: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const base = year && month && day ? `${MONTHS[month - 1]} ${day}, ${year}` : date;
  if (!loggedAt) return base;

  const parsed = new Date(loggedAt);
  if (Number.isNaN(parsed.getTime())) return base;

  let hours = parsed.getHours();
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutes = `${parsed.getMinutes()}`.padStart(2, "0");
  const seconds = `${parsed.getSeconds()}`.padStart(2, "0");

  return `${base} - ${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${meridiem}`;
}

/** Small hover/focus tooltip wrapper for the row action buttons. */
function ActionButton({
  label,
  onClick,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  tone: "red" | "blue";
  children: React.ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 transition focus:outline-none focus-visible:ring-2",
          tone === "red"
            ? "text-slate-400 hover:border-red-500/50 hover:bg-red-600/10 hover:text-red-300 focus-visible:ring-red-500/60"
            : "text-slate-400 hover:border-sky-500/50 hover:bg-sky-600/10 hover:text-sky-300 focus-visible:ring-sky-500/60",
        )}
      >
        {children}
      </button>

      {/* Tooltip */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-30 mb-1.5 w-max rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-medium text-slate-300 opacity-0 shadow-lg shadow-black/50 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

type PendingDelete = MeterReadingEntry | null;
export default function RecentReadingsTable({
  entries,
  baselineId = null,
  defaultExpanded = false,
  onAdd,
  onEdit,
  onDelete,
  className,
}: RecentReadingsTableProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * The baseline row is the oldest entry of the active cycle. When no explicit
   * id is supplied, infer it (entries arrive newest-first, so it is last).
   */
  const effectiveBaselineId = useMemo(() => {
    if (baselineId !== null && baselineId !== undefined) return baselineId;
    return entries.length > 0 ? entries[entries.length - 1].id : null;
  }, [baselineId, entries]);

  /** Quick filter across date, reading value and delta. */
  const visibleEntries = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) =>
      formatStamp(entry.date, entry.loggedAt).toLowerCase().includes(term) ||
      String(entry.reading).includes(term) ||
      String(entry.delta).includes(term),
    );
  }, [entries, query]);

  const hasQuery = query.trim().length > 0;

  async function handleConfirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      /* Phase 2: replace with the deleteMeterReading() server action. */
      await onDelete?.(pendingDelete);
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section
      aria-labelledby="recent-readings-heading"
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-card backdrop-blur-xl",
        className,
      )}
    >
      {/* ------------------------------------------------------------- */}
      {/* Collapsible header - always visible, one tap to reveal the log  */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900">
            <History className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2
              id="recent-readings-heading"
              className="truncate text-sm font-semibold uppercase tracking-wider text-slate-300"
            >
              Reading History &amp; Audit Log
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} this
              cycle
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
            aria-controls="recent-readings-body"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-slate-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            {isExpanded ? "Hide" : "Show"} History
            <motion.span
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="inline-flex"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </motion.span>
          </button>

          {onAdd && isExpanded && (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Add
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id="recent-readings-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {/* Quick filter */}
            <div className="px-4 pb-3 sm:px-5">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by date, reading or delta..."
                  aria-label="Filter reading history"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/70 py-2 pl-8 pr-8 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-slate-600 focus:ring-1 focus:ring-slate-500"
                />
                {hasQuery && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear filter"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 transition hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>            {/* Column headers (tablet and up) */}
            <div
              className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] gap-4 border-y border-slate-800 bg-slate-900/40 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:grid"
              aria-hidden="true"
            >
              <span>Date &amp; time</span>
              <span className="text-right">Reading (kWh)</span>
              <span className="text-right">Delta</span>
              <span className="w-[5.5rem] text-right">Actions</span>
            </div>

            {visibleEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-slate-400">
                  {hasQuery ? "No matching entries" : "No readings yet"}
                </p>
                <p className="max-w-xs text-xs leading-relaxed text-slate-500">
                  {hasQuery
                    ? "Try a different date, reading value or delta."
                    : "Log your first meter reading to start the cycle logbook."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {visibleEntries.map((entry) => {
                  const meta = ZONE_META[entry.zone];
                  const isBaseline = entry.id === effectiveBaselineId;
                  const rowPending = pendingDelete?.id === entry.id;

                  return (
                    <motion.li
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22 }}
                      className={cn(
                        "px-4 py-3.5 transition-colors duration-200 hover:bg-slate-800/25 sm:px-5",
                        rowPending && "bg-red-600/10",
                      )}
                    >
                      {/* Mobile: vertical card. sm+: aligned grid. */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] sm:items-center">
                        {/* Date & time */}
                        <div className="col-span-2 sm:col-span-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-white">
                              {formatStamp(entry.date, entry.loggedAt)}
                            </span>
                            {isBaseline && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-sky-600/40 bg-sky-600/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                                <Gauge className="h-2.5 w-2.5" aria-hidden="true" />
                                Cycle Start
                              </span>
                            )}
                          </div>
                          <span
                            className={cn(
                              "mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider sm:hidden",
                              meta.bg,
                              meta.border,
                              meta.text,
                            )}
                          >
                            {meta.label}
                          </span>
                        </div>

                        {/* Reading */}
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 sm:hidden">
                            Reading{" "}
                          </span>
                          <span className="text-sm font-bold tabular-nums text-white">
                            {formatMeterValue(entry.reading)}
                          </span>
                          <span className="ml-1 text-[11px] text-slate-500">
                            kWh
                          </span>
                        </div>

                        {/* Delta */}
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 sm:hidden">
                            Delta{" "}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                              entry.delta > 0
                                ? "border-amber-600/40 bg-amber-600/15 text-amber-300"
                                : "border-slate-800 bg-slate-900/60 text-slate-400",
                            )}
                          >
                            {entry.delta > 0 ? "+" : ""}
                            {formatMeterValue(entry.delta)} units
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                          <ActionButton
                            label="Edit Entry"
                            tone="blue"
                            onClick={() => onEdit?.(entry)}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </ActionButton>
                          <ActionButton
                            label="Delete Entry"
                            tone="red"
                            onClick={() => setPendingDelete(entry)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </ActionButton>
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {/* ---------------------------------------------------------- */}
      {/* Delete confirmation dialog                                 */}
      {/* ---------------------------------------------------------- */}
      <AnimatePresence>
        {pendingDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget && !isDeleting) {
                setPendingDelete(null);
              }
            }}
          >
            <motion.div
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              aria-hidden="true"
            />

            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-reading-title"
              aria-describedby="delete-reading-description"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl shadow-black/60"
            >
              <div className="p-5 sm:p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-600/30 bg-red-600/10">
                  <AlertTriangle
                    className="h-5 w-5 text-red-400"
                    aria-hidden="true"
                  />
                </span>

                <h3
                  id="delete-reading-title"
                  className="mt-4 text-base font-bold text-white"
                >
                  Delete Meter Reading?
                </h3>
                <p
                  id="delete-reading-description"
                  className="mt-1.5 text-sm leading-relaxed text-slate-400"
                >
                  This action will recalculate your dynamic burn rate and cycle
                  projection.
                </p>

                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                  <p className="text-xs font-semibold text-white">
                    {formatStamp(pendingDelete.date, pendingDelete.loggedAt)}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                    {formatMeterValue(pendingDelete.reading)} kWh
                    {pendingDelete.delta > 0
                      ? ` · +${formatMeterValue(pendingDelete.delta)} units`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-700/70 bg-slate-800/95 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPendingDelete(null)}
                  disabled={isDeleting}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed sm:flex-none",
                    isDeleting
                      ? "bg-red-600/50"
                      : "bg-red-600 hover:bg-red-500 active:scale-[0.99]",
                  )}
                >
                  {isDeleting ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isDeleting ? "Deleting..." : "Yes, Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}