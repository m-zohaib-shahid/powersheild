"use client";

import { useEffect } from "react";

import { RefreshCw, TriangleAlert } from "lucide-react";

/**
 * Route-level error boundary for /dashboard.
 *
 * The loader is already defensive, so this should never render - but a
 * Server Component error in production would otherwise render Next.js's
 * default error page. This keeps the failure inside the PowerShield design
 * language and offers a one-click retry.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PowerShield] dashboard route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card-surface w-full max-w-md p-6 text-center sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-600/30 bg-red-600/10">
          <TriangleAlert className="h-7 w-7 text-red-400" aria-hidden="true" />
        </span>

        <h1 className="mt-5 text-lg font-bold text-white">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The dashboard could not be loaded. Your saved meter readings are
          safe - this is usually a temporary connection issue.
        </p>

        {error.digest && (
          <p className="mt-3 break-all text-[11px] text-slate-600">
            Reference: {error.digest}
          </p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    </div>
  );
}
