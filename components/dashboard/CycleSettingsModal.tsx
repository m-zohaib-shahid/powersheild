"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, Info, Settings2, X } from "lucide-react";

import {
  CYCLE_LENGTH_DAYS,
  clampCycleDay,
  getCycleEndDate,
  getCycleStartDate,
} from "@/lib/burn-rate";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Billing cycle settings - lets the user anchor the 30-day window to their
 * own meter reset day (e.g. the 5th of every month). Purely presentational:
 * persistence is delegated to the `onSave` callback supplied by the page.
 * ------------------------------------------------------------------------- */

export interface CycleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Currently configured anchor day (1-31). */
  currentDay: number;
  /** User's display name / mode label, used for the ownership hint. */
  userName?: string;
  /**
   * Persists the new anchor day. Resolves to `true` on success; on `false` the
   * modal keeps itself open so the user can retry.
   */
  onSave: (day: number) => Promise<boolean>;
}

/** Compact "05 Sep 2026" formatter (avoids toLocaleDateString hydration drift). */
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function toIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatIso(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

/** Every selectable day, 1-31. */
const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);

export default function CycleSettingsModal({
  isOpen,
  onClose,
  currentDay,
  userName,
  onSave,
}: CycleSettingsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(
    clampCycleDay(currentDay),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  /* Keep the selection in sync whenever the modal is (re)opened. */
  useEffect(() => {
    if (isOpen) {
      setSelectedDay(clampCycleDay(currentDay));
      setError(null);
      setIsSaving(false);
    }
  }, [isOpen, currentDay]);

  useEffect(() => {
    setMounted(true);
  }, []);

  /* Lock background scroll and close on Escape while open. */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  /* Move focus into the dialog for keyboard/screen-reader users. */
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => dialogRef.current?.focus(), 200);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  /**
   * Live preview of the 30-day window the selected anchor would produce.
   * Recomputed on every change so the user sees the effect before saving.
   */
  const preview = useMemo(() => {
    const now = new Date();
    return {
      start: formatIso(toIso(getCycleStartDate(selectedDay, now))),
      end: formatIso(toIso(getCycleEndDate(selectedDay, now))),
    };
  }, [selectedDay]);

  const isDirty = selectedDay !== clampCycleDay(currentDay);

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    setError(null);

    try {
      const ok = await onSave(clampCycleDay(selectedDay));
      if (ok) {
        onClose();
      } else {
        setError("Could not save your billing day. Please try again.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close billing cycle settings"
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/75 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${baseId}-title`}
            aria-describedby={`${baseId}-description`}
            tabIndex={-1}
            className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-800 shadow-2xl shadow-black/50 focus:outline-none sm:max-w-lg sm:rounded-3xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
          >
            {/* Header */}
            <div className="shrink-0 border-b border-slate-700/70 px-4 pb-4 pt-3 sm:px-6 sm:pt-5">
              <span
                className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-slate-600 sm:hidden"
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id={`${baseId}-title`}
                    className="text-lg font-bold text-white"
                  >
                    Billing Cycle Settings
                  </h2>
                  <p
                    id={`${baseId}-description`}
                    className="mt-1 text-xs leading-relaxed text-slate-400"
                  >
                    Pick the day your meter resets each month. Your{" "}
                    {CYCLE_LENGTH_DAYS}-day window and every projection update
                    instantly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="-mr-1 shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-700/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {/* Live window preview */}
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-3.5">
                <CalendarClock
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Your active cycle
                  </p>
                  <p className="mt-1 text-sm text-emerald-100">
                    <span className="font-semibold">{preview.start}</span>
                    <span className="mx-1.5 text-emerald-400/70">&rarr;</span>
                    <span className="font-semibold">{preview.end}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-emerald-200/70">
                    {CYCLE_LENGTH_DAYS}-day window &middot; resets on day{" "}
                    {selectedDay} of every month
                  </p>
                </div>
              </div>

              {/* Day grid */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Cycle start day
                </legend>
                <div
                  role="radiogroup"
                  aria-label="Cycle start day of month"
                  className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2"
                >
                  {DAY_OPTIONS.map((day) => {
                    const isSelected = day === selectedDay;
                    const isCurrent = day === clampCycleDay(currentDay);

                    return (
                      <button
                        key={day}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setSelectedDay(day)}
                        className={cn(
                          "relative flex h-10 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60",
                          isSelected
                            ? "border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-900/40"
                            : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:bg-slate-700/50 hover:text-white",
                        )}
                      >
                        {day}
                        {isCurrent && !isSelected && (
                          <span
                            className="absolute bottom-1 h-1 w-1 rounded-full bg-slate-500"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Context note */}
              <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
                <Info
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Saved to your profile{userName ? ` (${userName})` : ""}.
                  Changing it re-bases your burn rate from the first meter log
                  on or after the new cycle start.
                </span>
              </p>

              {/* Save error */}
              <AnimatePresence initial={false}>
                {error && (
                  <motion.p
                    key="save-error"
                    role="alert"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 overflow-hidden rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2.5 text-xs font-medium text-red-300"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Sticky footer */}
            <div className="shrink-0 border-t border-slate-700/70 bg-slate-800/95 px-4 py-4 backdrop-blur sm:px-6">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !isDirty}
                  className={cn(
                    "flex flex-[1.6] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                    isSaving || !isDirty
                      ? "cursor-not-allowed bg-slate-700 text-slate-400"
                      : "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 active:scale-[0.99]",
                  )}
                >
                  {isSaving ? (
                    <Settings2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isSaving ? "Saving to Supabase..." : "Save Billing Day"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}