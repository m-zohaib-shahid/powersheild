import { beforeEach, describe, expect, it, vi } from "vitest";

/** Flip to true to make the fake DB reject writes (RLS-style failure). */
let writeShouldFail = false;
const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => mockRevalidatePath(p) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("@/utils/supabase/server", () => ({
  isSupabaseConfigured: () => true,
  createClient: () => ({
    from: () => {
      const node: any = new Proxy(
        {
          single: async () =>
            writeShouldFail
              ? { data: null, error: { message: "RLS denied" } }
              : { data: { id: "x", billing_cycle_day: 15 }, error: null },
          maybeSingle: async () => ({ data: null, error: null }),
        },
        { get: (t: Record<string, unknown>, k: string | symbol) => (k in t ? t[k as string] : () => node) },
      );
      return node;
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  writeShouldFail = false;
});

describe("revalidatePath contract", () => {
  it("calls revalidatePath('/dashboard') after a SUCCESSFUL write", async () => {
    const { updateBillingCycleDay } = await import("@/app/actions/meter");
    const res = await updateBillingCycleDay(15);
    expect(res.ok).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("does NOT revalidate when the write FAILS", async () => {
    writeShouldFail = true;
    const { updateBillingCycleDay } = await import("@/app/actions/meter");
    const res = await updateBillingCycleDay(20);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/RLS denied/);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("still resolves (never throws) on a rejected write", async () => {
    writeShouldFail = true;
    const { updateBillingCycleDay } = await import("@/app/actions/meter");
    await expect(updateBillingCycleDay(20)).resolves.toBeDefined();
  });
});