import DashboardView from "@/components/dashboard/DashboardView";
import { getDashboardData } from "@/lib/supabase-data";

/**
 * Dashboard route - a Server Component.
 *
 * All Supabase reads happen here (cookie-bound SSR client, session refreshed
 * by the root middleware), so the browser receives a fully-computed first
 * paint with zero client-side data waterfall. `DashboardView` then owns only
 * the interactive state (modal, optimistic inserts, gauge animation).
 */
export default async function DashboardPage() {
  const data = await getDashboardData();

  return <DashboardView initialData={data} />;
}
