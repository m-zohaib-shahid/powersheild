import { type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/middleware";

/**
 * Next.js Middleware — keeps the Supabase auth session fresh.
 *
 * Runs before every matched request, calls `supabase.auth.getUser()` to
 * revalidate the JWT, and copies any refreshed auth cookies onto the outgoing
 * response. This is what makes the cookie-based `createClient()` in Server
 * Components and Server Actions safe to use (the `setAll` write in a Server
 * Component is otherwise silently ignored).
 */
export async function middleware(request: NextRequest) {
  return createClient(request);
}

export const config = {
  matcher: [
    /*
     * Run on every path except static assets and image files — this keeps the
     * middleware off the hot path for CSS/JS/font requests.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
