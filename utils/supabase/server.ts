import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase-env";

export { isSupabaseConfigured };

/**
 * Server-side Supabase client bound to the request cookie store, so the user
 * session (and RLS policies) resolve correctly inside Server Components,
 * Server Actions and Route Handlers.
 */
export const createClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) => {
  /* Resolved at request time (not build time) - see lib/supabase-env.ts. */
  const { url, key } = getSupabaseEnv();

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the deployment environment.",
    );
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
};
