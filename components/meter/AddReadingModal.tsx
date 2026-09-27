"use client";

import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Check,
  CircleAlert,
  PencilLine,
  ScanLine,
  Upload,
  X,
} from "lucide-react";

import OcrScanner from "@/components/meter/OcrScanner";
import type { AddReadingModalProps } from "@/lib/types";
import { MOCK_READINGS } from "@/lib/mock-data";
import { ZONE_META, getConsumptionZone } from "@/lib/tariff";
import {
  MAX_METER_VALUE,
  createReadingFormSchema,
  extractFieldError,
  sanitizeMeterValue,
} from "@/lib/validation";
import { cn, formatReadingDate, toLocalDateString } from "@/lib/utils";

const TABS = [
  { id: "manual", label: "Manual Entry", icon: PencilLine },
  { id: "ocr", label: "Camera Scan", icon: Camera },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AddReadingModal({
  isOpen,
  onClose,
  previousReading = MOCK_READINGS[0].reading,
  previousReadingDate = MOCK_READINGS[0].date,
  onSubmit,
}: AddReadingModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("manual");
  const [meterValue, setMeterValue] = useState("");
  const [readingDate, setReadingDate] = useState("");
  const [touchedMeter, setTouchedMeter] = useState(false);
  const [touchedDate, setTouchedDate] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();

  const tabId = (id: TabId) => `${baseId}-tab-${id}`;
  const panelId = (id: TabId) => `${baseId}-panel-${id}`;

  const previousMeta = ZONE_META[getConsumptionZone(previousReading)];

  /* Strict Zod validation: reading_value >= last_reading (lib/validation). */
  const formSchema = useMemo(
    () => createReadingFormSchema(previousReading),
    [previousReading],
  );
  const formParse = formSchema.safeParse({ meterValue, readingDate });
  const formIssues = formParse.success ? [] : formParse.error.issues;
  const meterIssue = extractFieldError(formIssues, "meterValue");
  const dateIssue = extractFieldError(formIssues, "readingDate");
  const isFormValid = formParse.success;

  const showMeterError =
    meterIssue !== null && (touchedMeter || meterValue.trim() !== "");
  const showDateError = dateIssue !== null && touchedDate;

  /* The camera runs only while the OCR tab is visible and modal open —
     flipping this to false triggers OcrScanner's track cleanup instantly. */
  const isOcrActive = isOpen && activeTab === "ocr" && cameraEnabled;

  /* Render the portal only after hydration (document is client-only). */
  useEffect(() => {
    setMounted(true);
  }, []);

  /* Mirror the latest onClose in a ref so the global listener below is
     registered once per open-state change (inline callbacks never churn it). */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /* Global Escape handler dismisses the overlay from anywhere on the page;
     background scroll stays locked while open (symmetric cleanup). */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      /* Ignore IME composition keystrokes so native input flows survive. */
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  /* Reset the form each time the modal opens and focus the numeric field. */
  useEffect(() => {
    if (!isOpen) return;

    setActiveTab("manual");
    setMeterValue("");
    setReadingDate(toLocalDateString());
    setTouchedMeter(false);
    setTouchedDate(false);
    setFileName(null);
    setCameraEnabled(true);

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 380);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  /**
   * Numeric input handler: rejects blocked characters ("e", "E", "+", "-",
   * letters) and out-of-bounds values (>6 digits / >999999) by keeping the
   * previous value; long decimals are truncated to 2 places automatically.
   */
  function handleMeterValueChange(event: ChangeEvent<HTMLInputElement>): void {
    const sanitized = sanitizeMeterValue(event.target.value);
    if (sanitized === null) return;
    setMeterValue(sanitized);
  }

  function handleManualSubmit(): void {
    setTouchedMeter(true);
    setTouchedDate(true);

    const parsed = formSchema.safeParse({ meterValue, readingDate });
    if (!parsed.success) return;

    onSubmit?.({
      meterValue: Number(parsed.data.meterValue),
      readingDate: parsed.data.readingDate,
      source: "manual",
    });
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          onPointerDown={(event) => {
            /* Fallback outside-click: dismiss when the press lands on the
               overlay container itself (the backdrop below covers the rest). */
            if (event.target === event.currentTarget) onClose();
          }}
        >
          {/* Backdrop — click outside the sheet dismisses the modal */}
          <motion.button
            type="button"
            aria-label="Close add reading dialog"
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/75 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />

          {/* Bottom-sheet dialog (slides up on mobile, rises on desktop) */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${baseId}-title`}
            aria-describedby={`${baseId}-description`}
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-800 shadow-2xl shadow-black/50 sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
          >
            {/* Dialog header + tabs */}
            <div className="shrink-0 border-b border-slate-700/70 px-4 pb-4 pt-3 sm:px-6 sm:pt-5">
              <span
                className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-slate-600 sm:hidden"
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id={`${baseId}-title`}
                    className="text-lg font-bold tracking-tight text-white"
                  >
                    Add Meter Reading
                  </h2>
                  <p
                    id={`${baseId}-description`}
                    className="mt-1 text-xs leading-relaxed text-slate-400"
                  >
                    Log today&apos;s meter index to keep burn-rate forecasts
                    sharp.
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

              {/* Dual-tab switcher */}
              <div
                role="tablist"
                aria-label="Reading entry method"
                className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-700 bg-slate-900/60 p-1"
              >
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const TabIcon = tab.icon;

                  return (
                    <button
                      key={tab.id}
                      id={tabId(tab.id)}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={panelId(tab.id)}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "relative rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 sm:text-sm",
                        isActive
                          ? "text-white"
                          : "text-slate-400 hover:text-slate-200",
                      )}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="reading-tab-indicator"
                          className="absolute inset-0 rounded-lg bg-emerald-600 shadow-tab"
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 34,
                          }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative flex items-center justify-center gap-2">
                        <TabIcon className="h-4 w-4" aria-hidden="true" />
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {/* ---------- Tab 1: Manual entry ---------- */}
              <div
                role="tabpanel"
                id={panelId("manual")}
                aria-labelledby={tabId("manual")}
                hidden={activeTab !== "manual"}
                className="space-y-4"
              >
                {/* Numeric meter input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${baseId}-meter-value`}
                    className="text-xs font-semibold uppercase tracking-wider text-slate-400"
                  >
                    Current meter reading
                  </label>
                  <div className="relative">
                    <input
                      ref={inputRef}
                      id={`${baseId}-meter-value`}
                      name="meterValue"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="e.g. 148.5"
                      min={0}
                      max={MAX_METER_VALUE}
                      maxLength={9}
                      pattern="\d{0,6}(\.\d{0,2})?"
                      value={meterValue}
                      onChange={handleMeterValueChange}
                      onBlur={() => setTouchedMeter(true)}
                      aria-invalid={showMeterError}
                      aria-describedby={
                        showMeterError
                          ? `${baseId}-meter-error`
                          : `${baseId}-meter-hint`
                      }
                      className={cn(
                        "w-full rounded-xl border bg-slate-900/70 px-4 py-3 pr-16 text-base text-white outline-none transition placeholder:text-slate-500 focus:ring-2",
                        showMeterError
                          ? "border-red-600/60 focus:border-red-500 focus:ring-red-600/25"
                          : "border-slate-700 focus:border-emerald-600 focus:ring-emerald-600/25",
                      )}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      units
                    </span>
                  </div>
                  <p
                    id={`${baseId}-meter-hint`}
                    className="text-xs text-slate-500"
                  >
                    Previous reading:{" "}
                    <span className="font-medium tabular-nums text-slate-300">
                      {previousReading.toFixed(1)} units
                    </span>
                    {previousReadingDate
                      ? ` · ${formatReadingDate(previousReadingDate)}`
                      : ""}
                  </p>

                  {/* Validation error preview (value below previous reading) */}
                  <AnimatePresence initial={false}>
                    {showMeterError && (
                      <motion.p
                        key="meter-error"
                        id={`${baseId}-meter-error`}
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start gap-2 overflow-hidden rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2.5 text-xs font-medium leading-relaxed text-red-300"
                      >
                        <CircleAlert
                          className="mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{meterIssue}</span>
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Date picker */}
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${baseId}-reading-date`}
                    className="text-xs font-semibold uppercase tracking-wider text-slate-400"
                  >
                    Reading date
                  </label>
                  <input
                    id={`${baseId}-reading-date`}
                    name="readingDate"
                    type="date"
                    value={readingDate}
                    max={toLocalDateString()}
                    onChange={(event) => {
                      setReadingDate(event.target.value);
                      setTouchedDate(true);
                    }}
                    onBlur={() => setTouchedDate(true)}
                    aria-invalid={showDateError}
                    aria-describedby={
                      showDateError ? `${baseId}-date-error` : undefined
                    }
                    className={cn(
                      "w-full rounded-xl border bg-slate-900/70 px-4 py-3 text-base text-white outline-none transition focus:ring-2",
                      showDateError
                        ? "border-red-600/60 focus:border-red-500 focus:ring-red-600/25"
                        : "border-slate-700 focus:border-emerald-600 focus:ring-emerald-600/25",
                    )}
                  />
                  <AnimatePresence initial={false}>
                    {showDateError && (
                      <motion.p
                        key="date-error"
                        id={`${baseId}-date-error`}
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start gap-2 overflow-hidden rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2.5 text-xs font-medium text-red-300"
                      >
                        <CircleAlert
                          className="mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{dateIssue}</span>
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Context strip with the zone of the previous reading */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/50 px-3.5 py-3">
                  <span className="text-xs text-slate-400">
                    Previous reading zone
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      previousMeta.bg,
                      previousMeta.border,
                      previousMeta.text,
                    )}
                  >
                    {previousMeta.fullLabel}
                  </span>
                </div>
              </div>

              {/* ---------- Tab 2: Camera scan / OCR ---------- */}
              <div
                role="tabpanel"
                id={panelId("ocr")}
                aria-labelledby={tabId("ocr")}
                hidden={activeTab !== "ocr"}
                className="space-y-4"
              >
                {/* Live camera viewfinder — releases all tracks on close/tab switch */}
                <OcrScanner
                  isActive={isOcrActive}
                  onCapture={(file) => setFileName(file.name)}
                />

                {/* Capture actions: live camera is staged for Phase 2 */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setCameraEnabled((value) => !value)}
                    aria-pressed={cameraEnabled}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl border bg-slate-800 px-4 py-3 text-sm font-semibold transition",
                      cameraEnabled
                        ? "border-emerald-600/50 text-emerald-400 hover:border-emerald-500 hover:text-emerald-300"
                        : "border-slate-600 text-slate-200 hover:border-slate-500 hover:text-white",
                    )}
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    {cameraEnabled ? "Stop Camera" : "Open Camera"}
                  </button>
                  <label
                    htmlFor={`${baseId}-ocr-file`}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-emerald-600/50 hover:text-white focus-within:ring-2 focus-within:ring-emerald-500/60"
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Upload Photo
                  </label>
                  <input
                    id={`${baseId}-ocr-file`}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setFileName(file ? file.name : null);
                    }}
                  />
                </div>

                {/* Selected photo confirmation */}
                <AnimatePresence initial={false}>
                  {fileName && (
                    <motion.p
                      key="file-name"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2 overflow-hidden rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2.5 text-xs font-medium text-emerald-300"
                    >
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{fileName}</span> ready to scan
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* OCR action — enabled once the vision backend lands */}
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-3.5 text-sm font-semibold text-slate-400"
                >
                  <ScanLine className="h-4 w-4" aria-hidden="true" />
                  Scan Reading (OCR)
                </button>
                <p className="text-center text-[11px] leading-relaxed text-slate-500">
                  OCR runs on the vision backend — connect it to enable
                  auto-scan.
                </p>
              </div>
            </div>

            {/* Sticky footer keeps the primary action reachable while scrolling */}
            {activeTab === "manual" && (
              <div className="shrink-0 border-t border-slate-700/70 bg-slate-800/95 px-4 py-4 backdrop-blur sm:px-6">
                {!isFormValid && !showMeterError && !showDateError && (
                  <p className="mb-2.5 text-center text-[11px] text-slate-500">
                    Enter a reading of at least {previousReading.toFixed(1)}{" "}
                    units to continue.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleManualSubmit}
                  disabled={!isFormValid}
                  title={
                    isFormValid
                      ? undefined
                      : "Fix the highlighted fields to save this reading"
                  }
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                    isFormValid
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 active:scale-[0.99]"
                      : "cursor-not-allowed bg-slate-700 text-slate-400",
                  )}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Save Reading
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}





