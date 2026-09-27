import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Loading skeleton — mirrors the live layout (header, heading, gauge card,
 * 2x2 KPI grid and five log rows) so swapping in the dashboard causes zero
 * layout shift. Dark-slate tokens only; pure presentational, no client JS
 * required, which is why it can render from the server-side `Loading()`
 * boundary and from the static prerender.
 * ------------------------------------------------------------------------- */

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-slate-700/40", className)}
    />
  );
}

export default function DashboardSkeleton() {
  return (
    <div
      className="relative min-h-screen"
      role="status"
      aria-label="Loading dashboard"
    >
      {/* Header placeholder */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-700/70 bg-slate-900/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <SkeletonBlock className="h-8 w-8 rounded-xl" />
            <SkeletonBlock className="h-5 w-28 rounded-md" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <SkeletonBlock className="h-6 w-24 rounded-full" />
            <SkeletonBlock className="h-8 w-8 rounded-full sm:w-32" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6 md:pb-16 lg:px-8">
        {/* Heading placeholder */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <SkeletonBlock className="h-3 w-32 rounded-full" />
            <SkeletonBlock className="mt-3 h-8 w-72 max-w-full rounded-xl" />
            <SkeletonBlock className="mt-3 h-4 w-56 rounded-md" />
          </div>
          <SkeletonBlock className="hidden h-10 w-36 rounded-xl md:block" />
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
          {/* Gauge card placeholder */}
          <div className="card-surface p-5 sm:p-6 lg:col-span-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="mt-2 h-3 w-40 rounded-md" />
              </div>
              <SkeletonBlock className="h-6 w-16 rounded-full" />
            </div>
            <div className="mt-5 flex justify-center">
              <SkeletonBlock className="aspect-square w-full max-w-[264px] rounded-full" />
            </div>
            <SkeletonBlock className="mx-auto mt-6 h-4 w-64 max-w-full rounded-md" />
            <div className="mt-4 flex items-center justify-center gap-4">
              <SkeletonBlock className="h-3 w-20 rounded-full" />
              <SkeletonBlock className="h-3 w-24 rounded-full" />
              <SkeletonBlock className="h-3 w-20 rounded-full" />
            </div>
          </div>

          {/* KPI tiles placeholder (2x2 matches the live grid) */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-7">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-700 bg-slate-800/80 p-4 backdrop-blur-xl sm:p-5"
              >
                <SkeletonBlock className="h-10 w-10 rounded-xl" />
                <SkeletonBlock className="mt-4 h-3 w-24" />
                <SkeletonBlock className="mt-2.5 h-6 w-20 rounded-md" />
                <SkeletonBlock className="mt-2.5 h-3 w-28 rounded-md" />
              </div>
            ))}
          </div>

          {/* Recent logs placeholder */}
          <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/80 shadow-card backdrop-blur-xl lg:col-span-12">
            <div className="flex items-center justify-between gap-3 border-b border-slate-700/70 px-4 py-4 sm:px-5">
              <div>
                <SkeletonBlock className="h-4 w-36" />
                <SkeletonBlock className="mt-2 h-3 w-52 rounded-md" />
              </div>
              <SkeletonBlock className="h-6 w-20 rounded-full" />
            </div>
            <ul className="divide-y divide-slate-700/60">
              {[0, 1, 2, 3, 4].map((row) => (
                <li
                  key={row}
                  className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
                >
                  <SkeletonBlock className="h-9 w-9 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <SkeletonBlock className="h-4 w-32" />
                    <SkeletonBlock className="mt-2 h-3 w-44 rounded-md" />
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <SkeletonBlock className="h-4 w-20 rounded-md" />
                    <SkeletonBlock className="h-4 w-14 rounded-full" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
