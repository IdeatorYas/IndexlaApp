"use client";

import Link from "next/link";
import { APP_ROUTES } from "@/lib/routes";

export function MarketplaceHeroSection() {
  return (
    <section className="app-panel-priority relative overflow-hidden px-4 py-3 sm:px-5 sm:py-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(120deg,transparent,rgba(37,99,235,0.08)_40%,rgba(124,58,237,0.1))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)]"
      />

      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="app-label text-app-brand">Marketplace</p>
          <h1 className="app-display mt-0.5 text-[1.25rem] font-bold leading-tight text-app-ink sm:text-[1.5rem] lg:text-[1.6rem]">
            Discover. Build. Automate.
            {"\u00A0"}
            <span className="app-gradient-text">Own.</span>
          </h1>
          <p className="mt-1 max-w-2xl text-[12px] leading-snug text-app-muted sm:text-[13px]">
            Explore indexes and portfolios across crypto and tokenized assets
            while keeping the underlying assets in your wallet.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
          <Link
            href={APP_ROUTES.create}
            className="app-gradient-btn inline-flex h-9 items-center justify-center rounded-[10px] px-4 text-[12px] font-bold sm:h-10 sm:text-[13px]"
          >
            Create Portfolio / Index
          </Link>
          <p className="text-[10px] text-app-dim sm:text-right">
            Browse without connecting a wallet.
          </p>
        </div>
      </div>
    </section>
  );
}
