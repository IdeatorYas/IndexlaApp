"use client";

import Link from "next/link";
import { DashboardSectionHeading } from "@/components/dashboard/DashboardSectionHeading";
import { APP_ROUTES } from "@/lib/routes";

export function MarketplaceHeroSection() {
  return (
    <section className="app-panel-priority relative overflow-hidden px-3 py-1.5 sm:px-3.5 sm:py-2">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(120deg,transparent,rgba(37,99,235,0.07)_40%,rgba(124,58,237,0.08))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)]"
      />

      <div className="relative flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="min-w-0 flex-1">
          <DashboardSectionHeading label="Marketplace" tone="brand" size="sm" />
          <h1 className="app-display mt-0.5 text-[1.05rem] font-bold leading-tight text-app-ink sm:text-[1.2rem]">
            Discover. Build. Automate.
            {"\u00A0"}
            <span className="app-gradient-text">Own.</span>
          </h1>
          <p className="mt-0.5 max-w-2xl text-[10px] leading-snug text-app-muted sm:text-[11px]">
            Explore indexes and portfolios across crypto and tokenized assets
            while keeping the underlying assets in your wallet.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-0.5 sm:items-end">
          <Link
            href={APP_ROUTES.create}
            className="app-gradient-btn inline-flex h-7 items-center justify-center rounded-[8px] px-3 text-[10px] font-bold sm:h-8 sm:text-[11px]"
          >
            Create Portfolio / Index
          </Link>
          <p className="text-[8px] text-app-dim sm:text-right">
            Browse without connecting a wallet.
          </p>
        </div>
      </div>
    </section>
  );
}
