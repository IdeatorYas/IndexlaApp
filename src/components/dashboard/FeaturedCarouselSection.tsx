"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { FeaturedProductPreview } from "@/lib/domain/dashboard";
import { formatPercent } from "@/lib/dashboard/data";

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
      node.scrollLeft += 0.6;
      if (node.scrollLeft >= half) {
        node.scrollLeft -= half;
      }
    }, 16);

    return () => window.clearInterval(tick);
  }, [paused, items.length]);

  if (products.length === 0) return null;

  return (
    <section aria-label="Featured products carousel" className="relative">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <p className="app-label text-app-brand">Featured</p>
        <div className="flex gap-1">
          <CarouselArrow
            label="Scroll featured left"
            onClick={() => scrollBy(-220)}
          >
            ‹
          </CarouselArrow>
          <CarouselArrow
            label="Scroll featured right"
            onClick={() => scrollBy(220)}
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
          className="flex list-none gap-2 overflow-x-auto scroll-smooth pb-0.5 pl-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((product, index) => {
            const positive = product.performance30d >= 0;
            return (
              <li
                key={`${product.id}-${index}`}
                role="listitem"
                className="shrink-0 list-none"
              >
                <Link
                  href={product.href}
                  className="app-panel app-panel-hover flex w-[min(100%,220px)] items-center justify-between gap-2 px-3 py-2.5 sm:w-[220px]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                      {product.creatorName}
                    </p>
                    <p className="truncate text-[12px] font-bold text-app-ink">
                      {product.name}
                    </p>
                  </div>
                  <p
                    className={[
                      "app-metric shrink-0 text-[13px] font-bold",
                      positive ? "text-app-success" : "text-app-danger",
                    ].join(" ")}
                  >
                    {formatPercent(product.performance30d, true)}
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
      className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-app-line bg-app-elevated text-sm font-bold text-app-muted hover:border-app-brand/40 hover:text-app-ink"
    >
      {children}
    </button>
  );
}
