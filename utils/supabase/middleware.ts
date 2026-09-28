import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase-env";

/**
 * Middleware-bound Supabase client used only to refresh the auth session.
 *
 * Returns the (possibly rewritten) `NextResponse` that carries any refreshed
 * cookies back to the browser. When Supabase is not configured — local mock
 * mode or a preview build without env vars — a plain passthrough response is
 * returned so the app keeps working on mock data instead of crashing.
 */
export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  /* Resolved at request time (not build time) - see lib/supabase-env.ts. */
  const { url, key } = getSupabaseEnv();

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  /**
   * `getUser()` revalidates the JWT with the auth server on every request, so
   * Server Components never read from a stale cookie. The return value is
   * intentionally unused — we only need the cookie refresh side effect.
   */
  void supabase.auth.getUser();

  return supabaseResponse;
};
