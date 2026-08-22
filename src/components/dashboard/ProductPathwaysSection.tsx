import Link from "next/link";
import type { ProductPathway } from "@/lib/domain/dashboard";
import { SectionHeader } from "@/components/ui/SectionHeader";

const ACCENT: Record<
  ProductPathway["accent"],
  { tint: string; border: string; badge: string }
> = {
  blue: {
    tint: "app-tint-blue",
    border: "app-border-accent-blue",
    badge: "bg-[color:var(--color-accent-blue)]/15 text-[color:var(--color-accent-blue)]",
  },
  violet: {
    tint: "app-tint-violet",
    border: "app-border-accent-violet",
    badge:
      "bg-[color:var(--color-accent-violet)]/15 text-[color:var(--color-accent-violet)]",
  },
  magenta: {
    tint: "app-tint-violet",
    border: "app-border-accent-violet",
    badge:
      "bg-[color:var(--color-accent-magenta)]/15 text-[color:var(--color-accent-magenta)]",
  },
  emerald: {
    tint: "app-tint-emerald",
    border: "app-border-accent-emerald",
    badge:
      "bg-[color:var(--color-accent-emerald)]/15 text-[color:var(--color-accent-emerald)]",
  },
  amber: {
    tint: "app-tint-amber",
    border: "app-border-accent-amber",
    badge:
      "bg-[color:var(--color-accent-amber)]/15 text-[color:var(--color-accent-amber)]",
  },
  rose: {
    tint: "app-tint-rose",
    border: "app-border-accent-rose",
    badge:
      "bg-[color:var(--color-accent-rose)]/15 text-[color:var(--color-accent-rose)]",
  },
};

export function ProductPathwaysSection({
  pathways,
}: {
  pathways: ProductPathway[];
}) {
  return (
    <section>
      <SectionHeader
        title="Product Pathways"
        description="Five clear gateways into the INDEXLA product system."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {pathways.map((pathway) => {
          const styles = ACCENT[pathway.accent];
          return (
            <Link
              key={pathway.id}
              href={pathway.href}
              className={`app-panel app-panel-hover flex min-h-[170px] flex-col border p-5 ${styles.tint} ${styles.border}`}
            >
              <span
                className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles.badge}`}
              >
                Open
              </span>
              <h3 className="app-display mt-3 text-base font-bold text-app-ink">
                {pathway.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-app-muted">
                {pathway.description}
              </p>
              <p className="mt-4 text-sm font-bold text-app-brand">
                {pathway.cta} →
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
