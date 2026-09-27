import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";

/**
 * Streaming loading boundary for the dashboard route.
 *
 * Rendered while the Supabase queries resolve, so navigation shows the
 * layout-mirroring skeleton instead of a blank flash. Static (no client JS)
 * because it is part of the server-rendered tree.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
