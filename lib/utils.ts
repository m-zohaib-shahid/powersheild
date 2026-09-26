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

/** Converts YYYY-MM-DD into a friendly "27 Sep 2026" label. */
export function formatReadingDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
