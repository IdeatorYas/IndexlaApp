"use client";

import Link from "next/link";
import { useState } from "react";
import type { MarketplaceTab } from "@/lib/domain/dashboard";
import { APP_ROUTES } from "@/lib/routes";

const TABS: MarketplaceTab[] = ["All", "Indexes", "Portfolios"];

export function MarketplaceHeroSection() {
  const [tab, setTab] = useState<MarketplaceTab>("All");
  const tabParam =
    tab === "All" ? "" : tab === "Indexes" ? "indexes" : "portfolios";

  return (
    <section className="app-panel-glow relative overflow-hidden p-5 md:p-8">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.22),transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),transparent_70%)]" />

      <div className="relative grid gap-6 lg:grid-cols-[1.35fr_0.85fr] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-app-brand">
            Marketplace
          </p>
          <h1 className="app-display mt-2 text-3xl font-bold tracking-tight text-app-ink md:text-5xl">
            Discover. Build. Automate.{" "}
            <span className="app-gradient-text">Own.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-app-muted md:text-base">
            Explore indexes and portfolios across crypto and tokenized assets
            while keeping the underlying assets in your wallet.
          </p>

          <form
            action={APP_ROUTES.discover}
            className="mt-5 flex flex-col gap-3 sm:flex-row"
          >
            <input type="hidden" name="tab" value={tabParam} />
            <label className="sr-only" htmlFor="marketplace-hero-search">
              Search indexes, portfolios or assets
            </label>
            <input
              id="marketplace-hero-search"
              name="q"
              type="search"
              placeholder="Search indexes, portfolios or assets"
              className="w-full flex-1 rounded-xl border border-app-line bg-app-elevated px-4 py-3 text-sm text-app-ink outline-none placeholder:text-app-dim focus:border-app-brand/40"
            />
            <button
              type="submit"
              className="app-gradient-btn rounded-xl px-5 py-3 text-sm font-bold"
            >
              Search
            </button>
          </form>

          <div
            className="mt-4 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Marketplace product type"
          >
            {TABS.map((item) => {
              const selected = item === tab;
              return (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(item)}
                  className={[
                    "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                    selected
                      ? "bg-app-brand text-white shadow-[var(--shadow-glow)]"
                      : "border border-app-line bg-app-panel text-app-muted hover:text-app-ink",
                  ].join(" ")}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Link
            href={`${APP_ROUTES.discover}${tabParam ? `?tab=${tabParam}` : ""}`}
            className="app-gradient-btn inline-flex items-center justify-center rounded-xl px-5 py-3.5 text-sm font-bold"
          >
            Explore Marketplace
          </Link>
          <Link
            href={APP_ROUTES.create}
            className="inline-flex items-center justify-center rounded-xl border border-app-brand/35 bg-app-elevated px-5 py-3.5 text-sm font-bold text-app-brand hover:bg-app-soft"
          >
            Create Portfolio / Index
          </Link>
          <p className="text-center text-[11px] text-app-dim lg:text-left">
            Marketplace remains visible without wallet connection.
          </p>
        </div>
      </div>
    </section>
  );
}
