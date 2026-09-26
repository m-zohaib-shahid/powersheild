/** Joins conditional class names into a single string. */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/** Formats a Date as a local YYYY-MM-DD string (avoids UTC drift). */
export function toLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Converts YYYY-MM-DD into "27 Sep 2026" using fixed month names and plain
 * integer math — no Date/Intl locale APIs — so server and client always emit
 * the exact same string. This removes SSR hydration mismatches entirely
 * (suppressed on the element as well for belt-and-suspenders safety).
 */
export function formatReadingDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return isoDate;
  const monthName = MONTH_NAMES_SHORT[month - 1];
  return `${String(day).padStart(2, "0")} ${monthName} ${year}`;
}

/** Formats a unit count with a fixed number of decimals. */
export function formatUnits(value: number, decimals: number = 1): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Renders whole numbers without a trailing ".0" and decimals when present.
 * Pass `decimals` explicitly to force a fixed precision (e.g. 0).
 */
export function formatMeterValue(value: number, decimals?: number): string {
  if (decimals !== undefined) return formatUnits(value, decimals);
  return Number.isInteger(value) ? value.toString() : formatUnits(value, 1);
}
