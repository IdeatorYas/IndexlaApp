import Link from "next/link";
import type { ReactNode } from "react";

export type GatewayAccent =
  | "blue"
  | "violet"
  | "magenta"
  | "emerald"
  | "amber"
  | "indigo";

const ACCENT: Record<
  GatewayAccent,
  { bar: string; soft: string; badge: string }
> = {
  blue: {
    bar: "bg-[color:var(--color-accent-blue)]",
    soft: "from-[color:var(--color-accent-blue)]/12",
    badge:
      "bg-[color:var(--color-accent-blue)]/12 text-[color:var(--color-accent-blue)]",
  },
  violet: {
    bar: "bg-[color:var(--color-accent-violet)]",
    soft: "from-[color:var(--color-accent-violet)]/12",
    badge:
      "bg-[color:var(--color-accent-violet)]/12 text-[color:var(--color-accent-violet)]",
  },
  magenta: {
    bar: "bg-[color:var(--color-accent-magenta)]",
    soft: "from-[color:var(--color-accent-magenta)]/12",
    badge:
      "bg-[color:var(--color-accent-magenta)]/12 text-[color:var(--color-accent-magenta)]",
  },
  emerald: {
    bar: "bg-[color:var(--color-accent-emerald)]",
    soft: "from-[color:var(--color-accent-emerald)]/12",
    badge:
      "bg-[color:var(--color-accent-emerald)]/12 text-[color:var(--color-accent-emerald)]",
  },
  amber: {
    bar: "bg-[color:var(--color-accent-amber)]",
    soft: "from-[color:var(--color-accent-amber)]/12",
    badge:
      "bg-[color:var(--color-accent-amber)]/12 text-[color:var(--color-accent-amber)]",
  },
  indigo: {
    bar: "bg-[color:var(--color-accent-indigo)]",
    soft: "from-[color:var(--color-accent-indigo)]/12",
    badge:
      "bg-[color:var(--color-accent-indigo)]/12 text-[color:var(--color-accent-indigo)]",
  },
};

export function ProductGatewayCard({
  accent,
  title,
  href,
  cta,
  children,
}: {
  accent: GatewayAccent;
  title: string;
  href: string;
  cta: string;
  children: ReactNode;
}) {
  const styles = ACCENT[accent];

  return (
    <Link
      href={href}
      className="app-panel group relative flex min-h-[180px] flex-col overflow-hidden p-5 transition-transform hover:-translate-y-0.5"
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${styles.bar}`} />
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${styles.soft} to-transparent opacity-90`}
      />
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="app-display text-base font-bold text-app-ink md:text-lg">
            {title}
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles.badge}`}
          >
            Open
          </span>
        </div>
        <div className="mt-3 flex-1 space-y-1.5 text-sm text-app-muted">
          {children}
        </div>
        <p className="mt-4 text-sm font-bold text-app-brand group-hover:underline">
          {cta} →
        </p>
      </div>
    </Link>
  );
}
