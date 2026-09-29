import { describe, expect, it } from "vitest";

import {
  MAX_METER_VALUE,
  createReadingFormSchema,
  extractFieldError,
  sanitizeMeterValue,
} from "@/lib/validation";
import { getConsumptionZone, getDeltaZone, ZONE_META } from "@/lib/tariff";

// ---------------------------------------------------------------------------
describe("validation :: sanitizeMeterValue (input guard)", () => {
  it("returns null (rejects) for blocked characters", () => {
    for (const bad of ["abc", "1e3", "1E5", "+50", "-50", "12abc", "1.2.3", " "]) {
      expect(sanitizeMeterValue(bad)).toBeNull();
    }
  });

  it("returns empty string for cleared input", () => {
    expect(sanitizeMeterValue("")).toBe("");
  });

  it("accepts plain integers up to 6 digits", () => {
    expect(sanitizeMeterValue("4580")).toBe("4580");
    expect(sanitizeMeterValue("999999")).toBe("999999");
  });

  it("rejects integers longer than 6 digits", () => {
    expect(sanitizeMeterValue("1000000")).toBeNull();
    expect(sanitizeMeterValue("1234567")).toBeNull();
  });

  it("truncates to 2 decimal places on paste", () => {
    expect(sanitizeMeterValue("142.567")).toBe("142.56");
    expect(sanitizeMeterValue("1.239")).toBe("1.23");
    expect(sanitizeMeterValue("10.999")).toBe("10.99");
  });

  it("rejects values above the hard cap", () => {
    expect(sanitizeMeterValue("1000000")).toBeNull();
  });

  it("allows a trailing dot while typing", () => {
    expect(sanitizeMeterValue("12.")).toBe("12.");
  });

  it("rejects scientific notation but allows a leading dot", () => {
    expect(sanitizeMeterValue("1e5")).toBeNull();
    expect(sanitizeMeterValue(".5")).toBe(".5");
  });
});

// ---------------------------------------------------------------------------
describe("validation :: createReadingFormSchema (business rules)", () => {
  const schema = createReadingFormSchema(4600);

  const run = (v: Record<string, string>) => {
    const r = schema.safeParse(v);
    return { ok: r.success, issues: r.success ? [] : r.error.issues };
  };

  it("accepts a reading equal to the previous value", () => {
    const r = run({ meterValue: "4600", readingDate: "2026-09-28" });
    expect(r.ok).toBe(true);
  });

  it("accepts a reading above the previous value", () => {
    expect(run({ meterValue: "4700", readingDate: "2026-09-28" }).ok).toBe(true);
  });

  it("rejects a reading below the previous value with the exact message", () => {
    const r = run({ meterValue: "4599", readingDate: "2026-09-28" });
    expect(r.ok).toBe(false);
    const msg = extractFieldError(r.issues, "meterValue");
    expect(msg).toContain("cannot be lower than the previous reading");
    expect(msg).toContain("4600");
  });

  it("rejects an empty value", () => {
    const r = run({ meterValue: "", readingDate: "2026-09-28" });
    expect(r.ok).toBe(false);
    expect(extractFieldError(r.issues, "meterValue")).toMatch(/enter the current meter reading/i);
  });

  it("rejects non-numeric and scientific input", () => {
    for (const v of ["abc", "1e3", "+5", "-5", "12.34.56"]) {
      expect(run({ meterValue: v, readingDate: "2026-09-28" }).ok).toBe(false);
    }
  });

  it("rejects a value above the hard cap", () => {
    const r = run({ meterValue: "999999.99", readingDate: "2026-09-28" });
    expect(r.ok).toBe(false);
    // 6 digits + 2dp passes the SHAPE regex, so the CAP refine is what must fire.
    expect(extractFieldError(r.issues, "meterValue")).toContain(String(MAX_METER_VALUE));
  });

  it("7-digit input is rejected by the shape rule (first error shown)", () => {
    const r = run({ meterValue: "1000000", readingDate: "2026-09-28" });
    expect(r.ok).toBe(false);
    // Both rules fire; extractFieldError intentionally surfaces the first one.
    expect(extractFieldError(r.issues, "meterValue")).toMatch(/6 digits/);
    expect(r.issues.length).toBeGreaterThan(1);
  });

  it("rejects zero and negatives", () => {
    expect(run({ meterValue: "0", readingDate: "2026-09-28" }).ok).toBe(false);
  });

  it("requires a reading date", () => {
    const r = run({ meterValue: "4700", readingDate: "" });
    expect(r.ok).toBe(false);
    expect(extractFieldError(r.issues, "readingDate")).toMatch(/choose the date/i);
  });

  it("extractFieldError returns null for a clean field", () => {
    expect(extractFieldError([], "meterValue")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("tariff :: zone mapping and accent tokens", () => {
  it("maps consumption to the documented zones", () => {
    expect(getConsumptionZone(0)).toBe("safe");
    expect(getConsumptionZone(159)).toBe("safe");
    expect(getConsumptionZone(160)).toBe("warning");
    expect(getConsumptionZone(179)).toBe("warning");
    expect(getConsumptionZone(180)).toBe("critical");
    expect(getConsumptionZone(999)).toBe("critical");
  });

  it("clamps negative consumption into the safe zone", () => {
    expect(getConsumptionZone(-50)).toBe("safe");
  });

  it("maps daily-delta bands (inclusive thresholds)", () => {
    expect(getDeltaZone(0)).toBe("safe");
    expect(getDeltaZone(5.49)).toBe("safe");
    expect(getDeltaZone(5.5)).toBe("warning");   // >= 5.5
    expect(getDeltaZone(6.49)).toBe("warning");
    expect(getDeltaZone(6.5)).toBe("critical");  // >= 6.5
    expect(getDeltaZone(12)).toBe("critical");
  });

  it("uses the exact LESCO accent hex values", () => {
    expect(ZONE_META.safe.hex).toBe("#059669");
    expect(ZONE_META.warning.hex).toBe("#D97706");
    expect(ZONE_META.critical.hex).toBe("#DC2626");
  });

  it("every zone exposes the full presentational contract", () => {
    for (const z of ["safe", "warning", "critical"] as const) {
      const m = ZONE_META[z];
      expect(m.zone).toBe(z);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.fullLabel.length).toBeGreaterThan(0);
      expect(m.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(m.text).toBeTruthy();
      expect(m.bg).toBeTruthy();
      expect(m.border).toBeTruthy();
      expect(m.range).toBeTruthy();
    }
  });
});