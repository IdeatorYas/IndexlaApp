"use client";

import Link from "next/link";
import { DashboardSectionHeading } from "@/components/dashboard/DashboardSectionHeading";
import { NavIcon } from "@/components/shell/NavIcons";
import { APP_ROUTES } from "@/lib/routes";

export function MarketplaceHeroSection() {
  return (
    <section className="app-panel-priority relative overflow-hidden px-2.5 py-1 sm:px-3 sm:py-1.5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(120deg,transparent,rgba(37,99,235,0.06)_40%,rgba(124,58,237,0.07))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[2px] bg-gradient-to-b from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)]"
      />

      <div className="relative flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="min-w-0 flex-1">
          <DashboardSectionHeading label="Marketplace" tone="brand" size="sm" />
          <h1 className="app-display mt-0.5 text-[1rem] font-bold leading-tight text-app-ink sm:text-[1.1rem]">
            Discover. Build. Automate.
            {"\u00A0"}
            <span className="app-gradient-text">Own.</span>
          </h1>
          <p className="mt-0.5 max-w-2xl text-[9px] leading-snug text-app-muted sm:text-[10px]">
            Explore indexes and portfolios across crypto and tokenized assets
            while keeping the underlying assets in your wallet.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end sm:self-center">
          <Link
            href={APP_ROUTES.create}
            className="group relative inline-flex w-full min-w-[220px] flex-col overflow-hidden rounded-[12px] border border-app-brand/35 bg-gradient-to-br from-app-elevated via-app-panel to-app-elevated p-[1px] shadow-[0_12px_32px_-18px_rgba(37,99,235,0.55)] transition hover:border-app-brand/55 hover:shadow-[0_14px_36px_-16px_rgba(37,99,235,0.65)] sm:w-auto"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-grad-from)] to-transparent opacity-80"
            />
            <span className="app-gradient-btn relative inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[11px] px-4 py-2.5 text-white">
              <NavIcon
                name="Create Portfolio / Index"
                className="h-4 w-4 shrink-0 opacity-95"
              />
              <span className="text-[12px] font-bold leading-none tracking-[0.02em] sm:text-[13px]">
                Create Portfolio / Index
              </span>
            </span>
          </Link>
          <p className="max-w-[240px] text-[9px] leading-snug text-app-dim sm:text-right">
            Browse without connecting a wallet.
          </p>
        </div>
      </div>
    </section>
  );
}
