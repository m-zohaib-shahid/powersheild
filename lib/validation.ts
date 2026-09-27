import { z } from "zod";

/** Hard cap for a 6-digit electricity meter index (max 999999). */
export const MAX_METER_VALUE = 999999;

/** Maximum decimal places a meter reading may carry. */
export const MAX_DECIMAL_PLACES = 2;

/** Permissive intake pattern: digits with at most one decimal point. */
export const METER_RAW_INPUT_PATTERN = /^\d*\.?\d*$/;

/**
 * Final accepted shape: up to 6 integer digits plus an optional 1-2 digit
 * decimal part. Letters and "+"/"-"/"e"/"E" can never match this pattern.
 * A trailing "." is allowed while typing and caught by numeric refinements.
 */
export const METER_SHAPE_PATTERN = /^\d{0,6}(\.\d{0,2})?$/;

/**
 * Normalizes a raw keystroke/paste for the meter field.
 *
 * - Blocks "e", "E", "+", "-" and every other non-numeric character.
 * - Rejects integer parts longer than 6 digits (hard cap 999999).
 * - Truncates decimals to {@link MAX_DECIMAL_PLACES} places on paste.
 *
 * @returns the sanitized string, "" for cleared input, or `null` when the
 *          change must be rejected (the field keeps its previous value).
 */
export function sanitizeMeterValue(raw: string): string | null {
  if (raw === "") return "";
  if (!METER_RAW_INPUT_PATTERN.test(raw)) return null;

  const [integerPart = "", decimalPart] = raw.split(".");
  if (integerPart.length > 6) return null;

  const sanitized =
    decimalPart !== undefined
      ? `${integerPart}.${decimalPart.slice(0, MAX_DECIMAL_PLACES)}`
      : integerPart;

  if (Number(sanitized) > MAX_METER_VALUE) return null;
  return sanitized;
}

/**
 * Builds the strict manual-entry schema for a given previous meter reading.
 * Business rule: `reading_value >= last_reading` — equal is allowed so an
 * unchanged meter can still be logged; lower values are rejected with the
 * inline message required by QA.
 */
/** Formats a meter index for messages: 4580 → "4580", 4573.6 → "4573.6". */
function formatMeterIndex(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function createReadingFormSchema(previousReading: number) {
  const previousLabel = formatMeterIndex(previousReading);

  return z.object({
    meterValue: z
      .string()
      .trim()
      .min(1, "Enter the current meter reading to continue.")
      .regex(
        METER_SHAPE_PATTERN,
        `Meter reading allows up to 6 digits and a maximum of ${MAX_DECIMAL_PLACES} decimal places.`,
      )
      .refine(
        (value) => Number.isFinite(Number(value)) && Number(value) > 0,
        "Meter reading must be greater than zero.",
      )
      .refine(
        (value) => Number(value) <= MAX_METER_VALUE,
        `Meter reading cannot exceed ${MAX_METER_VALUE}.`,
      )
      .refine(
        (value) => Number(value) >= previousReading,
        `New meter reading cannot be lower than the previous reading (${previousLabel} kWh).`,
      ),
    readingDate: z
      .string()
      .trim()
      .min(1, "Choose the date this reading was taken."),
  });
}

export type ReadingFormValues = z.infer<
  ReturnType<typeof createReadingFormSchema>
>;

/** Returns the first validation message recorded for `field`, if any. */
export function extractFieldError(
  issues: z.ZodIssue[],
  field: keyof ReadingFormValues,
): string | null {
  const issue = issues.find((item) => item.path[0] === field);
  return issue ? issue.message : null;
}
