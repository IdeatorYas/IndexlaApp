"use client";

import Link from "next/link";
import { useState } from "react";
import type { ChartPeriod, DashboardOverview } from "@/lib/domain/dashboard";
import type { WalletConnection } from "@/lib/domain/types";
import type { DashboardLoadState } from "@/components/wallet/DemoWalletProvider";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { NetworkBadges } from "@/components/ui/NetworkBadges";
import { PeriodTabs } from "@/components/ui/PeriodTabs";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import {
  DisconnectedWalletState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import {
  formatPercent,
  formatUsd,
  formatUsdSigned,
} from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

export function PortfolioOverviewSection({
  overview,
  wallet,
  loadState,
  onConnect,
  onRetry,
}: {
  overview: DashboardOverview;
  wallet: WalletConnection;
  loadState: DashboardLoadState;
  onConnect: () => void;
  onRetry: () => void;
}) {
  const [period, setPeriod] = useState<ChartPeriod>("30d");
  const positive = overview.return30dPercent >= 0;

  if (wallet.state === "disconnected") {
    return (
      <section className="app-panel p-5 md:p-7">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="app-display text-xl font-bold text-app-ink">
            Portfolio Overview
          </h2>
        </div>
        <DisconnectedWalletState onConnect={onConnect} showAction={false} />
      </section>
    );
  }

  if (loadState === "loading") {
    return (
      <section className="app-panel p-5 md:p-7">
        <LoadingSkeleton title="Loading portfolio overview" lines={5} />
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="app-panel p-5 md:p-7">
        <ErrorState
          description="Unable to load portfolio overview. No transaction was executed."
          action={
            <button
              type="button"
              onClick={onRetry}
              className="app-gradient-btn rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Retry
            </button>
          }
        />
      </section>
    );
  }

  return (
    <section className="app-panel overflow-hidden p-5 md:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="app-display text-xl font-bold text-app-ink md:text-2xl">
              Portfolio Overview
            </h2>
            {overview.isIllustrative ? <IllustrativeBadge /> : null}
          </div>
          <p className="mt-1 text-sm text-app-muted">
            Total value, performance and automation health
          </p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.2fr]">
        <div>
          <p className="text-sm font-medium text-app-muted">
            Total Portfolio Value
          </p>
          <p className="app-display mt-1 text-4xl font-bold tracking-tight text-app-ink md:text-5xl">
            {formatUsd(overview.totalValueUsd)}
          </p>
          <p
            className={[
              "mt-2 text-sm font-semibold",
              positive ? "text-app-success" : "text-app-danger",
            ].join(" ")}
          >
            {formatPercent(overview.return30dPercent, true)} (30D) ·{" "}
            {formatUsdSigned(overview.change30dUsd)}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={`${APP_ROUTES.portfolio}?action=add-funds`}
              className="app-gradient-btn inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              + Add Funds
            </Link>
            <Link
              href={APP_ROUTES.create}
              className="inline-flex items-center rounded-xl border border-app-brand/30 px-4 py-2.5 text-sm font-semibold text-app-brand hover:bg-app-soft"
            >
              Create Portfolio
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-panel/60 p-3 md:p-4">
          <div className="h-40 md:h-48">
            <MiniLineChart points={overview.chartSeries[period]} height={192} />
          </div>
          <p className="mt-2 text-center text-[11px] text-app-dim">
            Portfolio performance · {period.toUpperCase()}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Invested" value={formatUsd(overview.investedUsd)} />
        <Metric label="Available" value={formatUsd(overview.availableUsd)} />
        <Metric
          label="Total Return"
          value={`${formatUsdSigned(overview.totalReturnUsd)} · ${formatPercent(overview.totalReturnPercent, true)}`}
          accent="success"
        />
        <Metric
          label="Active Automations"
          value={String(overview.activeAutomations)}
          accent="violet"
        />
      </div>

      <div className="mt-5 border-t border-app-line pt-4">
        <NetworkBadges networkIds={overview.networkIds} />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "violet";
}) {
  return (
    <div className="app-panel-soft p-3.5">
      <p className="text-xs font-medium text-app-dim">{label}</p>
      <p
        className={[
          "mt-1 text-sm font-bold",
          accent === "success"
            ? "text-app-success"
            : accent === "violet"
              ? "text-[color:var(--color-accent-violet)]"
              : "text-app-ink",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
