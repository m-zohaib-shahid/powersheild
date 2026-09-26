import { z } from "zod";

/**
 * Plain decimal meter index: "142", "142.5" or ".5".
 * Rejects scientific notation, signs and trailing garbage ("1e3", "12abc").
 */
const PLAIN_NUMBER_PATTERN = /^(?:\d+\.?\d*|\.\d+)$/;

/**
 * Builds the strict manual-entry schema for a given previous meter reading.
 * Business rule: `reading_value >= last_reading` — equal is allowed so an
 * unchanged meter can still be logged; lower values are rejected with the
 * inline message required by QA.
 */
export function createReadingFormSchema(previousReading: number) {
  return z.object({
    meterValue: z
      .string()
      .trim()
      .min(1, "Enter the current meter reading to continue.")
      .regex(PLAIN_NUMBER_PATTERN, "Meter reading must be a valid number.")
      .refine(
        (value) => Number(value) > 0,
        "Meter reading must be greater than zero.",
      )
      .refine(
        (value) => Number(value) >= previousReading,
        `New reading cannot be lower than previous entry of ${previousReading.toFixed(1)}`,
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
