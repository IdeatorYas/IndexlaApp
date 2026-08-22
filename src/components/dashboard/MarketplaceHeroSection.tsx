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
    <section className="app-panel-priority relative overflow-hidden px-4 py-4 sm:px-5 sm:py-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(120deg,transparent,rgba(37,99,235,0.08)_40%,rgba(124,58,237,0.1))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)]"
      />

      <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1">
          <p className="app-label text-app-brand">Marketplace</p>
          <h1 className="app-display mt-1 text-[1.45rem] font-bold leading-tight text-app-ink sm:text-[1.75rem] lg:text-[1.85rem]">
            Discover. Build. Automate.
            {"\u00A0"}
            <span className="app-gradient-text">Own.</span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-app-muted">
            Explore indexes and portfolios across crypto and tokenized assets
            while keeping the underlying assets in your wallet.
          </p>

          <div
            className="mt-3 flex flex-wrap gap-1.5"
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
                    "h-8 rounded-full px-3 text-[12px] font-bold transition-colors",
                    selected
                      ? "bg-app-brand text-white"
                      : "border border-app-line bg-app-panel text-app-muted hover:text-app-ink",
                  ].join(" ")}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col lg:items-stretch">
          <Link
            href={`${APP_ROUTES.discover}${tabParam ? `?tab=${tabParam}` : ""}`}
            className="app-gradient-btn inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-[13px] font-bold"
          >
            Explore Marketplace
          </Link>
          <Link
            href={APP_ROUTES.create}
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-app-brand/35 bg-app-elevated px-4 text-[13px] font-bold text-app-brand hover:bg-app-soft"
          >
            Create Portfolio / Index
          </Link>
          <p className="text-center text-[10px] text-app-dim lg:text-left">
            Browse without connecting a wallet.
          </p>
        </div>
      </div>
    </section>
  );
}
