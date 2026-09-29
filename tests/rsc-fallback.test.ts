import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * White-box tests for the RSC-safety contract:
 *   "a Server Component must never reject - every failure becomes { ok:false }".
 *
 * The real Supabase client is mocked at module level so we can simulate:
 *   - network failure (fetch throws)
 *   - PostgREST error codes (PGRST205 table missing, 42501 RLS denial)
 *   - empty result sets
 */

// --- module mocks (hoisted before importing the action under test) ---
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockMaybeSingle = vi.fn();
const mockInsert = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockGte = vi.fn();
const mockLt = vi.fn();
const mockOr = vi.fn();

function chainable() {
  return {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    eq: mockEq,
    order: mockOrder,
    limit: mockLimit,
    gte: mockGte,
    lt: mockLt,
    or: mockOr,
    maybeSingle: mockMaybeSingle,
    single: mockSingle,
  };
}

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  isSupabaseConfigured: vi.fn(() => true),
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  })),
}));

const importAction = async () => import("@/app/actions/meter");

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue(chainable());
  mockSelect.mockReturnValue(chainable());
  mockUpdate.mockReturnValue(chainable());
  mockEq.mockReturnValue(chainable());
  mockOrder.mockReturnValue(chainable());
  mockLimit.mockReturnValue(chainable());
  mockGte.mockReturnValue(chainable());
  mockLt.mockReturnValue(chainable());
  mockOr.mockReturnValue(chainable());
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
});

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
describe("RSC safety :: getBillingCycleDay never throws", () => {
  it("returns the default when the profiles table is missing (PGRST205)", async () => {
    mockSelect.mockReturnValue({
      eq: () => ({
        maybeSingle: async () => ({
          data: null,
          error: { code: "PGRST205", message: "table not found" },
        }),
      }),
    });
    const { getBillingCycleDay } = await importAction();
    await expect(getBillingCycleDay()).resolves.toBe(5);
  });

  it("returns the default on an RLS denial (42501)", async () => {
    mockSelect.mockReturnValue({
      eq: () => ({
        maybeSingle: async () => ({
          data: null,
          error: { code: "42501", message: "permission denied" },
        }),
      }),
    });
    const { getBillingCycleDay } = await importAction();
    await expect(getBillingCycleDay()).resolves.toBe(5);
  });

  it("returns the default when the row is simply absent (empty result)", async () => {
    mockSelect.mockReturnValue({
      eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    });
    const { getBillingCycleDay } = await importAction();
    await expect(getBillingCycleDay()).resolves.toBe(5);
  });

  it("returns a valid stored day on the happy path", async () => {
    mockSelect.mockReturnValue({
      eq: () => ({ maybeSingle: async () => ({ data: { billing_cycle_day: 12 }, error: null }) }),
    });
    const { getBillingCycleDay } = await importAction();
    await expect(getBillingCycleDay()).resolves.toBe(12);
  });

  it("falls back when the stored value is out of range", async () => {
    mockSelect.mockReturnValue({
      eq: () => ({ maybeSingle: async () => ({ data: { billing_cycle_day: 99 }, error: null }) }),
    });
    const { getBillingCycleDay } = await importAction();
    await expect(getBillingCycleDay()).resolves.toBe(5);
  });
});

// ---------------------------------------------------------------------------
describe("RSC safety :: read actions degrade instead of throwing", () => {
  it("getLatestReading returns ok:false on a network failure", async () => {
    // Self-referential builder: every chain method returns the same node, and
    // awaiting it (the .thenable) rejects - exactly like a dropped network call.
    const boom: any = new Proxy({ then: (_r: any, rej: any) => rej(new Error("ECONNREFUSED")) }, {
      get: (t: any, k: string) => (k in t ? t[k] : () => boom),
    });
    mockFrom.mockReturnValue(boom);
    const { getLatestReading } = await importAction();
    const res = await getLatestReading();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/ECONNREFUSED/);
  });

  it("getLatestReading returns ok:false when the table is missing", async () => {
    const miss = { ...chainable(), or: () => miss, limit: async () => ({ data: null, error: { message: "PGRST205" } }) };
    mockSelect.mockReturnValue({ ...chainable(), order: () => ({ ...chainable(), order: () => miss }) });
    const { getLatestReading } = await importAction();
    const res = await getLatestReading();
    expect(res.ok).toBe(false);
  });

  it("getCycleBaseline returns nulls (not a throw) when both queries fail", async () => {
    const bad = { ...chainable(), or: () => bad, gte: () => bad, lt: () => bad, limit: async () => ({ data: null, error: { message: "boom" } }) };
    mockSelect.mockReturnValue({ ...chainable(), order: () => ({ ...chainable(), order: () => bad }) });
    const { getCycleBaseline } = await importAction();
    const res = await getCycleBaseline("2026-09-10");
    expect(res.ok).toBe(false);
  });

  it("getCycleBaseline surfaces both candidates on success", async () => {
    let call = 0;
    const node = { ...chainable(), or: () => node, gte: () => node, lt: () => node, limit: async () => {
      call++;
      return call === 1
        ? { data: [{ id: "a", reading_value: 100, reading_date: "2026-09-12" }], error: null }
        : { data: [{ id: "b", reading_value: 90, reading_date: "2026-09-01" }], error: null };
    } };
    mockSelect.mockReturnValue({ ...chainable(), order: () => ({ ...chainable(), order: () => node }) });
    const { getCycleBaseline } = await importAction();
    const res = await getCycleBaseline("2026-09-10");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.firstInCycle?.reading_value).toBe(100);
      expect(res.data.lastBeforeCycle?.reading_value).toBe(90);
    }
  });
});

// ---------------------------------------------------------------------------
describe("RSC safety :: write actions validate + never throw", () => {
  it("rejects a negative reading before touching the database", async () => {
    const { logMeterReading } = await importAction();
    const res = await logMeterReading(-10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/non-negative/);
  });

  it("rejects a malformed date before touching the database", async () => {
    const { logMeterReading } = await importAction();
    const res = await logMeterReading(100, "28-09-2026");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/YYYY-MM-DD/);
  });

  it("returns ok:false (not a throw) when the insert fails", async () => {
    mockInsert.mockReturnValue({
      select: () => ({
        single: async () => ({ data: null, error: { message: "duplicate key" } }),
      }),
    });
    const { logMeterReading } = await importAction();
    const res = await logMeterReading(4600, "2026-09-28");
    expect(res.ok).toBe(false);
  });

  it("returns ok:false when the network throws during insert", async () => {
    mockInsert.mockReturnValue({
      select: () => ({ single: async () => { throw new Error("ETIMEDOUT"); } }),
    });
    const { logMeterReading } = await importAction();
    const res = await logMeterReading(4600, "2026-09-28");
    expect(res.ok).toBe(false);
  });

  it("updateBillingCycleDay returns ok:false on failure (never throws)", async () => {
    mockUpdate.mockReturnValue({
      select: () => ({ single: async () => ({ data: null, error: { message: "RLS" } }) }),
    });
    const { updateBillingCycleDay } = await importAction();
    const res = await updateBillingCycleDay(15);
    expect(res.ok).toBe(false);
  });
});