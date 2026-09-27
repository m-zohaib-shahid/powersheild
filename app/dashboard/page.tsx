import DashboardView from "@/components/dashboard/DashboardView";
import { getDashboardDataSafe } from "@/lib/supabase-data";

/**
 * Always render this route on demand.
 *
 * The page reads Supabase through cookie-bound queries, so it must never be
 * prerendered into a static artifact at build time. A stale cached page is
 * what previously surfaced as a production crash after a deploy.
 */
export const dynamic = "force-dynamic";

/** Never cache the RSC payload either. */
export const revalidate = 0;

/**
 * Dashboard route - a Server Component.
 *
 * All Supabase reads happen here (cookie-bound SSR client, session refreshed
 * by the root middleware), so the browser receives a fully-computed first
 * paint with zero client-side data waterfall.
 *
 * `getDashboardDataSafe` never rejects: on any Supabase failure it returns
 * mock data so this component cannot throw a 500 in production.
 */
export default async function DashboardPage() {
  const data = await getDashboardDataSafe();

  return <DashboardView initialData={data} />;
}
