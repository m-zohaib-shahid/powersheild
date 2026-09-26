import { ChevronDown } from "lucide-react";

import type { HeaderProps } from "@/lib/types";
import { MOCK_USER } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** PowerShield shield + bolt brand mark (inline SVG so it scales crisply). */
function PowerShieldMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="PowerShield logo"
      className={cn("h-8 w-8 shrink-0", className)}
    >
      <defs>
        <linearGradient id="ps-mark-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
      </defs>
      <path
        d="M16 2 L4 6.5 V16 C4 23.2 9 29.4 16 31.5 C23 29.4 28 23.2 28 16 V6.5 Z"
        fill="url(#ps-mark-gradient)"
      />
      <path
        d="M17.8 8.2 L11 18.4 h4.1 l-1.1 5.9 6.8-10.2 h-4.1 l1.1-5.9 Z"
        fill="#0F172A"
      />
    </svg>
  );
}

export default function Header({
  user = MOCK_USER,
  className,
}: HeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-slate-700/70 bg-slate-900/85 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <a
          href="/dashboard"
          className="group flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
        >
          <PowerShieldMark className="transition-transform duration-300 group-hover:-translate-y-0.5" />
          <span className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">
            Power<span className="text-emerald-400">Shield</span>
          </span>
        </a>

        {/* Status + profile */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/40 bg-emerald-600/15 px-2 py-1 sm:px-3"
            title="Your consumption is inside the safe slab"
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 sm:text-[11px]">
              Protected
            </span>
          </span>

          <button
            type="button"
            aria-label={`Account menu for ${user.name}`}
            className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/80 py-1 pl-1 pr-2 transition hover:border-slate-600 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 sm:pr-3"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-bold text-white ring-1 ring-emerald-400/30">
              {user.initials}
            </span>
            <span className="hidden text-sm font-medium text-slate-200 sm:inline">
              {user.name}
            </span>
            <ChevronDown
              className="hidden h-4 w-4 text-slate-400 sm:block"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </header>
  );
}
