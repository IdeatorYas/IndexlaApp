"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCreatorsWorkspace, getDiscoverCatalog, getStrategiesWorkspace } from "@/lib/data";
import { APP_ROUTES, NAV_ITEMS } from "@/lib/routes";

type SearchHit = {
  id: string;
  kind: "Navigation" | "Index" | "Portfolio" | "Creator" | "Strategy";
  title: string;
  subtitle: string;
  href: string;
};

function buildHits(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  const hits: SearchHit[] = [];

  for (const item of NAV_ITEMS) {
    hits.push({
      id: `nav-${item.href}`,
      kind: "Navigation",
      title: item.label,
      subtitle: item.href,
      href: item.href,
    });
  }

  hits.push(
    {
      id: "nav-activate",
      kind: "Navigation",
      title: "Creator Activation",
      subtitle: APP_ROUTES.creatorActivate,
      href: APP_ROUTES.creatorActivate,
    },
    {
      id: "nav-creator-lb",
      kind: "Navigation",
      title: "Creator Leaderboard",
      subtitle: APP_ROUTES.creatorLeaderboard,
      href: APP_ROUTES.creatorLeaderboard,
    },
    {
      id: "nav-creator-dash",
      kind: "Navigation",
      title: "Creator Dashboard",
      subtitle: APP_ROUTES.creatorDashboard,
      href: APP_ROUTES.creatorDashboard,
    },
  );

  const catalog = getDiscoverCatalog().data;
  for (const product of catalog.products) {
    hits.push({
      id: `product-${product.id}`,
      kind: product.kind === "Index" ? "Index" : "Portfolio",
      title: product.name,
      subtitle: `${product.kind} · @${product.creatorHandle}`,
      href: product.href,
    });
  }

  const creators = getCreatorsWorkspace().data.creators;
  for (const creator of creators) {
    hits.push({
      id: `creator-${creator.handle}`,
      kind: "Creator",
      title: creator.displayName,
      subtitle: `@${creator.handle} · ${creator.specialty}`,
      href: APP_ROUTES.creatorProfile(creator.handle),
    });
  }

  const strategies = getStrategiesWorkspace().data.marketplace;
  for (const strategy of strategies) {
    hits.push({
      id: `strategy-${strategy.id}`,
      kind: "Strategy",
      title: strategy.name,
      subtitle: `@${strategy.creatorHandle} · ${strategy.category}`,
      href: `${APP_ROUTES.strategies}?focus=${strategy.id}`,
    });
  }

  if (!q) return hits.slice(0, 12);

  return hits
    .filter(
      (hit) =>
        hit.title.toLowerCase().includes(q) ||
        hit.subtitle.toLowerCase().includes(q) ||
        hit.kind.toLowerCase().includes(q),
    )
    .slice(0, 24);
}

export function GlobalCommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => buildHits(query), [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK =
        (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("indexla-open-command-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("indexla-open-command-search", onOpen);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[14px] border border-app-line bg-app-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-app-line px-3 py-2">
          <label className="sr-only" htmlFor="global-command-search">
            Search portfolios, indexes, creators, strategies and navigation
          </label>
          <input
            id="global-command-search"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && hits[activeIndex]) {
                e.preventDefault();
                window.location.assign(hits[activeIndex].href);
                close();
              }
            }}
            placeholder="Search portfolios, indexes, creators, strategies…"
            className="h-11 w-full bg-transparent text-sm text-app-ink outline-none placeholder:text-app-dim"
            autoComplete="off"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {hits.length === 0 ? (
            <li className="px-3 py-4 text-sm text-app-muted">No matches</li>
          ) : (
            hits.map((hit, index) => (
              <li key={hit.id} role="option" aria-selected={index === activeIndex}>
                <Link
                  href={hit.href}
                  onClick={close}
                  className={[
                    "flex items-start justify-between gap-3 rounded-[10px] px-3 py-2.5",
                    index === activeIndex
                      ? "bg-app-brand/10 text-app-ink"
                      : "hover:bg-app-soft",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-app-ink">
                      {hit.title}
                    </p>
                    <p className="truncate text-[11px] text-app-muted">
                      {hit.subtitle}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-app-line px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-muted">
                    {hit.kind}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-app-line px-3 py-2 text-[10px] text-app-dim">
          ↑↓ navigate · Enter open · Esc close · Illustrative preview search
        </p>
      </div>
    </div>
  );
}

export function openGlobalCommandSearchEvent() {
  window.dispatchEvent(new CustomEvent("indexla-open-command-search"));
}
