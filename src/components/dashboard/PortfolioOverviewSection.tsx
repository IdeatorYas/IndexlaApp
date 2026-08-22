"use client";

import Link from "next/link";
import { useState } from "react";
import type { ChartPeriod } from "@/lib/domain/dashboard";
import type { DashboardOverview } from "@/lib/domain/dashboard";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { NetworkBadges } from "@/components/ui/NetworkBadges";
import { PeriodTabs } from "@/components/ui/PeriodTabs";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
import type { DashboardLoadState } from "@/components/wallet/DemoWalletProvider";
import type { WalletConnection } from "@/lib/domain/types";

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
      <section className="app-panel p-5 md:p-6">
        <SectionHeader
          title="Portfolio Overview"
          description="Connect your wallet to view balances and automation health."
        />
        <DisconnectedWalletState onConnect={onConnect} showAction={false} />
      </section>
    );
  }

  if (loadState === "loading") {
    return (
      <section className="app-panel p-5 md:p-6">
        <SectionHeader title="Portfolio Overview" illustrative />
        <LoadingSkeleton lines={5} />
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="app-panel p-5 md:p-6">
        <SectionHeader title="Portfolio Overview" illustrative />
        <ErrorState
          description="Unable to load portfolio overview. No transaction was executed."
          action={
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-app-brand px-4 py-2 text-sm font-medium text-white"
            >
              Retry
            </button>
          }
        />
      </section>
    );
  }

  return (
    <section className="app-panel p-5 md:p-6">
      <SectionHeader
        title="Portfolio Overview"
        illustrative={overview.isIllustrative}
        action={<PeriodTabs value={period} onChange={setPeriod} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm text-app-muted">Total Portfolio Value</p>
          <p className="app-display mt-1 text-3xl font-bold text-app-ink md:text-4xl">
            {formatUsd(overview.totalValueUsd)}
          </p>
          <p
            className={[
              "mt-2 text-sm font-medium",
              positive ? "text-app-success" : "text-app-danger",
            ].join(" ")}
          >
            {formatUsdSigned(overview.change30dUsd)} ·{" "}
            {formatPercent(overview.return30dPercent, true)} (30D)
          </p>

          <div className="mt-6 h-32 md:h-40">
            <MiniLineChart points={overview.chartSeries[period]} height={160} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Metric label="Invested balance" value={formatUsd(overview.investedUsd)} />
          <Metric label="Available balance" value={formatUsd(overview.availableUsd)} />
          <Metric
            label="Total return"
            value={`${formatUsd(overview.totalReturnUsd)} · ${formatPercent(overview.totalReturnPercent, true)}`}
          />
          <Metric
            label="Active automations"
            value={String(overview.activeAutomations)}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-app-line pt-5">
        <NetworkBadges networkIds={overview.networkIds} />
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${APP_ROUTES.portfolio}?action=add-funds`}
            className="rounded-lg border border-app-line px-4 py-2 text-sm font-medium text-app-ink hover:bg-app-panel"
          >
            Add Funds
          </Link>
          <Link
            href={APP_ROUTES.create}
            className="rounded-lg bg-app-brand px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            Create Portfolio
          </Link>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-app-line bg-app-panel/50 p-3">
      <p className="text-xs text-app-dim">{label}</p>
      <p className="mt-1 text-sm font-semibold text-app-ink">{value}</p>
    </div>
  );
}
