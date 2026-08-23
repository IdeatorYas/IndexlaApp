"use client";

import Link from "next/link";
import { DashboardSectionHeading } from "@/components/dashboard/DashboardSectionHeading";
import { APP_ROUTES } from "@/lib/routes";

export function MarketplaceHeroSection() {
  return (
    <section className="app-panel-priority relative overflow-hidden px-3 py-2 sm:px-4 sm:py-2.5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(120deg,transparent,rgba(37,99,235,0.08)_40%,rgba(124,58,237,0.1))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)]"
      />

      <div className="relative flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <DashboardSectionHeading label="Marketplace" tone="brand" size="sm" />
          <h1 className="app-display mt-1 text-[1.15rem] font-bold leading-tight text-app-ink sm:text-[1.35rem]">
            Discover. Build. Automate.
            {"\u00A0"}
            <span className="app-gradient-text">Own.</span>
          </h1>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-snug text-app-muted sm:text-[12px]">
            Explore indexes and portfolios across crypto and tokenized assets
            while keeping the underlying assets in your wallet.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-1 sm:items-end">
          <Link
            href={APP_ROUTES.create}
            className="app-gradient-btn inline-flex h-8 items-center justify-center rounded-[9px] px-3.5 text-[11px] font-bold sm:h-9 sm:text-[12px]"
          >
            Create Portfolio / Index
          </Link>
          <p className="text-[9px] text-app-dim sm:text-right">
            Browse without connecting a wallet.
          </p>
        </div>
      </div>
    </section>
  );
}
