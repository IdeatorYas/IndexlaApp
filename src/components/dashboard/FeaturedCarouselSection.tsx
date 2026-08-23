"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { FeaturedProductPreview } from "@/lib/domain/dashboard";
import { DashboardSectionHeading } from "@/components/dashboard/DashboardSectionHeading";
import { formatPercent } from "@/lib/dashboard/data";

const ITEM_ACCENTS = [
  {
    shell:
      "border-[color:var(--color-accent-blue)]/35 bg-gradient-to-br from-[color:var(--color-accent-blue)]/14 to-transparent",
    dot: "bg-[color:var(--color-accent-blue)]",
  },
  {
    shell:
      "border-[color:var(--color-accent-violet)]/35 bg-gradient-to-br from-[color:var(--color-accent-violet)]/14 to-transparent",
    dot: "bg-[color:var(--color-accent-violet)]",
  },
  {
    shell:
      "border-[color:var(--color-accent-rose)]/35 bg-gradient-to-br from-[color:var(--color-accent-rose)]/14 to-transparent",
    dot: "bg-[color:var(--color-accent-rose)]",
  },
  {
    shell:
      "border-[color:var(--color-accent-cyan)]/35 bg-gradient-to-br from-[color:var(--color-accent-cyan)]/14 to-transparent",
    dot: "bg-[color:var(--color-accent-cyan)]",
  },
] as const;

export function FeaturedCarouselSection({
  products,
}: {
  products: FeaturedProductPreview[];
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [paused, setPaused] = useState(false);
  const items = products.length > 0 ? [...products, ...products] : [];

  const scrollBy = useCallback((delta: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (paused || items.length === 0) return;
    const el = trackRef.current;
    if (!el) return;

    const half = el.scrollWidth / 2;
    const tick = window.setInterval(() => {
      if (!trackRef.current) return;
      const node = trackRef.current;
      node.scrollLeft += 0.65;
      if (node.scrollLeft >= half) {
        node.scrollLeft -= half;
      }
    }, 16);

    return () => window.clearInterval(tick);
  }, [paused, items.length]);

  if (products.length === 0) return null;

  return (
    <section
      aria-label="Featured products carousel"
      className="relative pt-0"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <DashboardSectionHeading label="Featured" tone="brand" size="md" />
        <div className="flex gap-0.5">
          <CarouselArrow
            label="Scroll featured left"
            onClick={() => scrollBy(-240)}
          >
            ‹
          </CarouselArrow>
          <CarouselArrow
            label="Scroll featured right"
            onClick={() => scrollBy(240)}
          >
            ›
          </CarouselArrow>
        </div>
      </div>

      <div
        className="relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <ul
          ref={trackRef}
          className="flex list-none gap-1.5 overflow-x-auto scroll-smooth py-0.5 pl-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((product, index) => {
            const positive = product.performance30d >= 0;
            const accent = ITEM_ACCENTS[index % ITEM_ACCENTS.length];
            const perf = formatPercent(product.performance30d, true);

            return (
              <li
                key={`${product.id}-${index}`}
                role="listitem"
                className="shrink-0 list-none"
              >
                <Link
                  href={product.href}
                  className={[
                    "flex w-[min(100%,280px)] items-center gap-2 rounded-[9px] border px-2.5 py-1.5 transition-colors hover:brightness-105 sm:w-[280px]",
                    accent.shell,
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className={["h-1.5 w-1.5 shrink-0 rounded-full", accent.dot].join(
                      " ",
                    )}
                  />
                  <p className="min-w-0 flex-1 truncate text-[11px] leading-tight text-app-ink">
                    <span className="font-semibold text-app-muted">
                      {product.creatorName}
                    </span>
                    <span className="text-app-dim"> · </span>
                    <span className="font-bold">{product.name}</span>
                    <span className="text-app-dim"> · </span>
                    <span
                      className={[
                        "font-bold",
                        positive ? "text-app-success" : "text-app-danger",
                      ].join(" ")}
                    >
                      {perf}
                    </span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function CarouselArrow({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-app-line bg-app-elevated text-xs font-bold text-app-muted hover:border-app-brand/40 hover:text-app-ink"
    >
      {children}
    </button>
  );
}
