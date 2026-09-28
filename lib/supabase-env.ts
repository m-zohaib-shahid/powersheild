/**
 * Supabase environment resolution (runtime-safe).
 *
 * WHY THIS FILE EXISTS
 *
 * `process.env.NEXT_PUBLIC_*` is INLINED BY WEBPACK AT BUILD TIME. If a
 * deploy is built before the env vars are present (a very common Vercel
 * ordering issue), the value is baked into the bundle as `undefined` and
 * stays `undefined` forever - setting the variable afterwards has no effect,
 * and the app silently degrades to mock data in production while working fine
 * on localhost.
 *
 * To avoid that, these values are read through a lookup that is NOT statically
 * analysable, which stops webpack from performing the substitution. The
 * runtime then resolves `process.env` at request time, so the same build works
 * with env vars attached at runtime.
 *
 * NOTE: deliberately NOT importing `server-only`, because this module is also
 * consumed by `middleware.ts`, which runs on the Edge runtime.
 */

type EnvSource = Record<string, unknown>;

/**
 * Reads an environment variable without triggering Next's build-time
 * inlining. The computed key access defeats static analysis.
 */
function readEnv(name: string): string | null {
  const source: EnvSource = process.env;
  const value = source[name];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export interface SupabaseEnv {
  url: string | null;
  key: string | null;
}

/**
 * Resolves the Supabase credentials, preferring the standard names and falling
 * back to legacy aliases so older deployments keep working.
 *
 * @returns `null` for each value that is genuinely missing.
 */
export function getSupabaseEnv(): SupabaseEnv {
  return {
    url:
      readEnv("NEXT_PUBLIC_SUPABASE_URL") ??
      readEnv("SUPABASE_URL") ??
      readEnv("SUPABASE_ANON_URL"),
    key:
      readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ??
      readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
      readEnv("SUPABASE_ANON_KEY"),
  };
}

/** True only when BOTH the project URL and an API key are resolvable. */
export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseEnv();
  return Boolean(url && key);
}

