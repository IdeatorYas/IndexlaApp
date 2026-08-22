import Link from "next/link";
import type { ReactNode } from "react";

export type GatewayAccent =
  | "blue"
  | "violet"
  | "magenta"
  | "emerald"
  | "amber"
  | "indigo";

const ACCENT_STYLES: Record<
  GatewayAccent,
  { border: string; glow: string; badge: string }
> = {
  blue: {
    border: "border-[color:var(--color-accent-blue)]",
    glow: "from-[color:var(--color-accent-blue)]/10",
    badge: "bg-[color:var(--color-accent-blue)]/15 text-[color:var(--color-accent-blue)]",
  },
  violet: {
    border: "border-[color:var(--color-accent-violet)]",
    glow: "from-[color:var(--color-accent-violet)]/10",
    badge: "bg-[color:var(--color-accent-violet)]/15 text-[color:var(--color-accent-violet)]",
  },
  magenta: {
    border: "border-[color:var(--color-accent-magenta)]",
    glow: "from-[color:var(--color-accent-magenta)]/10",
    badge: "bg-[color:var(--color-accent-magenta)]/15 text-[color:var(--color-accent-magenta)]",
  },
  emerald: {
    border: "border-[color:var(--color-accent-emerald)]",
    glow: "from-[color:var(--color-accent-emerald)]/10",
    badge: "bg-[color:var(--color-accent-emerald)]/15 text-[color:var(--color-accent-emerald)]",
  },
  amber: {
    border: "border-[color:var(--color-accent-amber)]",
    glow: "from-[color:var(--color-accent-amber)]/10",
    badge: "bg-[color:var(--color-accent-amber)]/15 text-[color:var(--color-accent-amber)]",
  },
  indigo: {
    border: "border-[color:var(--color-accent-indigo)]",
    glow: "from-[color:var(--color-accent-indigo)]/10",
    badge: "bg-[color:var(--color-accent-indigo)]/15 text-[color:var(--color-accent-indigo)]",
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
  const styles = ACCENT_STYLES[accent];

  return (
    <Link
      href={href}
      className={[
        "app-panel group relative overflow-hidden border-l-4 p-5 transition-transform hover:-translate-y-0.5 hover:shadow-lg",
        styles.border,
      ].join(" ")}
    >
      <div
        className={[
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-80",
          styles.glow,
        ].join(" ")}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <h3 className="app-display text-base font-semibold text-app-ink md:text-lg">
            {title}
          </h3>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              styles.badge,
            ].join(" ")}
          >
            Gateway
          </span>
        </div>
        <div className="mt-3 space-y-1 text-sm text-app-muted">{children}</div>
        <p className="mt-4 text-sm font-semibold text-app-brand group-hover:underline">
          {cta} →
        </p>
      </div>
    </Link>
  );
}
