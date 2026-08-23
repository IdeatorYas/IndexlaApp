"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import type { FeaturedProductPreview } from "@/lib/domain/dashboard";
import { formatPercent } from "@/lib/dashboard/data";
import { getCreatorsWorkspace } from "@/lib/data";

const CARD_THEMES = [
  {
    shell:
      "border-[color:var(--color-accent-blue)]/50 bg-gradient-to-br from-[color:var(--color-accent-blue)]/24 via-[color:var(--color-accent-cyan)]/10 to-app-elevated/90",
    bar: "from-[color:var(--color-accent-blue)] to-[color:var(--color-accent-cyan)]",
    glow: "group-hover:shadow-[0_0_22px_-4px_rgba(59,130,246,0.45)]",
  },
  {
    shell:
      "border-[color:var(--color-accent-violet)]/50 bg-gradient-to-br from-[color:var(--color-accent-violet)]/24 via-[color:var(--color-accent-indigo)]/10 to-app-elevated/90",
    bar: "from-[color:var(--color-accent-violet)] to-[color:var(--color-accent-indigo)]",
    glow: "group-hover:shadow-[0_0_22px_-4px_rgba(124,58,237,0.45)]",
  },
  {
    shell:
      "border-[color:var(--color-accent-rose)]/50 bg-gradient-to-br from-[color:var(--color-accent-rose)]/24 via-[color:var(--color-accent-magenta)]/10 to-app-elevated/90",
    bar: "from-[color:var(--color-accent-rose)] to-[color:var(--color-accent-magenta)]",
    glow: "group-hover:shadow-[0_0_22px_-4px_rgba(244,63,94,0.4)]",
  },
  {
    shell:
      "border-[color:var(--color-accent-cyan)]/45 bg-gradient-to-br from-[color:var(--color-accent-cyan)]/22 via-[color:var(--color-accent-blue)]/8 to-app-elevated/90",
    bar: "from-[color:var(--color-accent-cyan)] to-[color:var(--color-accent-blue)]",
    glow: "group-hover:shadow-[0_0_22px_-4px_rgba(34,211,238,0.35)]",
  },
] as const;

const LOOP_COPIES = 4;
const CARD_GAP = 8;

function creatorVisuals(handle: string, displayName: string) {
  const creator = getCreatorsWorkspace().data.creators.find(
    (entry) => entry.handle === handle,
  );
  if (creator) {
    return { initials: creator.avatarInitials, hue: creator.avatarHue };
  }
  const parts = displayName.trim().split(/\s+/);
  const initials =
    parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return { initials, hue: (handle.length * 41) % 360 };
}

export function FeaturedCarouselSection({
  products,
  layout = "stacked",
  className = "",
}: {
  products: FeaturedProductPreview[];
  layout?: "stacked" | "inline";
  className?: string;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const setWidthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);

  const items = useMemo(
    () =>
      products.length > 0
        ? Array.from({ length: LOOP_COPIES }, () => products).flat()
        : [],
    [products],
  );

  const measureSetWidth = useCallback(() => {
    const el = trackRef.current;
    if (!el || products.length === 0) return 0;

    let width = 0;
    for (let i = 0; i < products.length; i += 1) {
      const child = el.children[i] as HTMLElement | undefined;
      if (!child) return 0;
      width += child.offsetWidth + CARD_GAP;
    }
    return Math.max(width - CARD_GAP, 0);
  }, [products.length]);

  const scrollBy = useCallback((delta: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || products.length === 0) return;

    const applySetWidth = () => {
      const measured = measureSetWidth();
      if (measured > 0) {
        setWidthRef.current = measured;
        if (el.scrollLeft < measured * 0.5 || el.scrollLeft >= measured * 2.5) {
          el.scrollLeft = measured;
        }
      }
    };

    applySetWidth();
    const observer = new ResizeObserver(applySetWidth);
    observer.observe(el);

    return () => observer.disconnect();
  }, [measureSetWidth, products.length]);

  useEffect(() => {
    if (paused || items.length === 0) return;

    const tick = () => {
      const node = trackRef.current;
      const setWidth = setWidthRef.current;
      if (node && setWidth > 0) {
        node.scrollLeft += 0.65;
        if (node.scrollLeft >= setWidth * 2) {
          node.scrollLeft -= setWidth;
        }
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [paused, items.length]);

  const creatorAvatars = useMemo(() => {
    const map = new Map<string, { initials: string; hue: number }>();
    for (const product of products) {
      if (!map.has(product.id)) {
        map.set(
          product.id,
          creatorVisuals(product.creatorHandle, product.creatorName),
        );
      }
    }
    return map;
  }, [products]);

  if (products.length === 0) return null;

  const isInline = layout === "inline";

  const track = (
    <div
      className="relative min-w-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {!isInline ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-app-bg/80 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-app-bg/80 to-transparent"
          />
        </>
      ) : (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-app-brand/10 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-app-brand/10 to-transparent"
          />
        </>
      )}
      <ul
        ref={trackRef}
        className="flex list-none gap-2 overflow-x-auto py-0.5 pl-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((product, index) => (
          <CarouselCard
            key={`${product.id}-${index}`}
            product={product}
            index={index}
            avatar={
              creatorAvatars.get(product.id) ??
              creatorVisuals(product.creatorHandle, product.creatorName)
            }
            compact={isInline}
          />
        ))}
      </ul>
    </div>
  );

  if (isInline) {
    return (
      <section
        aria-label="Featured products carousel"
        className={["relative overflow-hidden", className].join(" ")}
      >
        {track}
      </section>
    );
  }

  return (
    <section
      aria-label="Featured products carousel"
      className={[
        "relative shrink-0 overflow-hidden border-b border-app-line/80 bg-gradient-to-r from-app-brand/10 via-[color:var(--color-accent-violet)]/8 to-[color:var(--color-accent-cyan)]/8 px-3 py-1.5 sm:px-5 sm:py-2 lg:px-6",
        className,
      ].join(" ")}
    >
      <div className="relative mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-app-brand/40 bg-gradient-to-r from-app-brand/25 to-[color:var(--color-accent-violet)]/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-app-brand">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-brand" />
            Featured
          </span>
        </div>
        <div className="flex gap-0.5">
          <CarouselArrow
            label="Scroll featured left"
            onClick={() => scrollBy(-280)}
          >
            ‹
          </CarouselArrow>
          <CarouselArrow
            label="Scroll featured right"
            onClick={() => scrollBy(280)}
          >
            ›
          </CarouselArrow>
        </div>
      </div>
      {track}
    </section>
  );
}

function CarouselCard({
  product,
  index,
  avatar,
  compact,
}: {
  product: FeaturedProductPreview;
  index: number;
  avatar: { initials: string; hue: number };
  compact: boolean;
}) {
  const positive = product.performance30d >= 0;
  const theme = CARD_THEMES[index % CARD_THEMES.length];
  const perf = formatPercent(product.performance30d, true);

  return (
    <li role="listitem" className="shrink-0 list-none">
      <Link
        href={product.href}
        aria-label={`${product.creatorName} · ${product.name} · ${perf}`}
        className={[
          "group relative flex items-center overflow-hidden rounded-[9px] border transition-all duration-200 hover:-translate-y-px",
          compact ? "w-[248px] gap-2 px-2 py-1.5" : "w-[min(100%,268px)] gap-2.5 px-2.5 py-2 sm:w-[268px]",
          theme.shell,
          theme.glow,
        ].join(" ")}
      >
        <div
          aria-hidden
          className={[
            "absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r opacity-90",
            theme.bar,
          ].join(" ")}
        />
        <span className="absolute right-2 top-1.5 rounded-[5px] border border-white/10 bg-black/20 px-1 py-px text-[7px] font-bold uppercase tracking-[0.08em] text-white/90 backdrop-blur-sm">
          Featured
        </span>
        <CreatorAvatar initials={avatar.initials} hue={avatar.hue} size={compact ? 30 : 34} />
        <div className="min-w-0 flex-1 pr-10">
          <p className="truncate text-[8px] font-semibold uppercase tracking-wide text-app-muted sm:text-[9px]">
            {product.creatorName}
          </p>
          <p className="truncate text-[12px] font-bold leading-tight text-app-ink sm:text-[13px]">
            {product.name}
          </p>
        </div>
        <span
          className={[
            "shrink-0 rounded-[7px] px-1.5 py-0.5 text-[10px] font-bold tabular-nums sm:text-[11px]",
            positive
              ? "bg-app-success/18 text-app-success ring-1 ring-app-success/30"
              : "bg-app-danger/18 text-app-danger ring-1 ring-app-danger/30",
          ].join(" ")}
        >
          {perf}
        </span>
      </Link>
    </li>
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
      className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-app-line/80 bg-app-elevated/90 text-xs font-bold text-app-muted backdrop-blur-sm transition-colors hover:border-app-brand/45 hover:text-app-ink"
    >
      {children}
    </button>
  );
}
