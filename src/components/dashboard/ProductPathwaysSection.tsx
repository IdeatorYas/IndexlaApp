import Link from "next/link";
import type { ProductPathway } from "@/lib/domain/dashboard";
import { SectionHeader } from "@/components/ui/SectionHeader";

const ACCENT: Record<
  ProductPathway["accent"],
  { bar: string; badge: string; top: string }
> = {
  blue: {
    bar: "app-accent-bar-blue",
    top: "app-top-accent-blue",
    badge:
      "bg-[color:var(--color-accent-blue)]/15 text-[color:var(--color-accent-blue)]",
  },
  violet: {
    bar: "app-accent-bar-violet",
    top: "app-top-accent-violet",
    badge:
      "bg-[color:var(--color-accent-violet)]/15 text-[color:var(--color-accent-violet)]",
  },
  magenta: {
    bar: "app-accent-bar-violet",
    top: "app-top-accent-violet",
    badge:
      "bg-[color:var(--color-accent-magenta)]/15 text-[color:var(--color-accent-magenta)]",
  },
  emerald: {
    bar: "app-accent-bar-emerald",
    top: "app-top-accent-emerald",
    badge:
      "bg-[color:var(--color-accent-emerald)]/15 text-[color:var(--color-accent-emerald)]",
  },
  amber: {
    bar: "app-accent-bar-amber",
    top: "app-top-accent-amber",
    badge:
      "bg-[color:var(--color-accent-amber)]/15 text-[color:var(--color-accent-amber)]",
  },
  rose: {
    bar: "app-accent-bar-rose",
    top: "app-top-accent-rose",
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
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        {pathways.map((pathway) => {
          const styles = ACCENT[pathway.accent];
          return (
            <Link
              key={pathway.id}
              href={pathway.href}
              className={`app-panel app-panel-hover flex min-h-[132px] flex-col p-3.5 ${styles.bar} ${styles.top}`}
            >
              <span
                className={`w-fit rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${styles.badge}`}
              >
                Open
              </span>
              <h3 className="app-display mt-2 text-[14px] font-bold leading-snug text-app-ink">
                {pathway.title}
              </h3>
              <p className="mt-1.5 flex-1 text-[12px] leading-snug text-app-muted">
                {pathway.description}
              </p>
              <p className="mt-2.5 text-[12px] font-bold text-app-brand">
                {pathway.cta} →
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
