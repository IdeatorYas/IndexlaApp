"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  ChartPeriod,
  DashboardActivityItem,
  DashboardAutomationSummary,
  DashboardOverview,
} from "@/lib/domain/dashboard";
import type { Portfolio, WalletConnection } from "@/lib/domain/types";
import type { DashboardLoadState } from "@/components/wallet/DemoWalletProvider";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { PeriodTabs } from "@/components/ui/PeriodTabs";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import {
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import {
  formatPercent,
  formatRelativeTime,
  formatUsd,
  formatUsdSigned,
  formatDexla,
} from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

export function PersonalSnapshotSection({
  overview,
  portfolios,
  automation,
  activity,
  wallet,
  loadState,
  onConnect,
  onRetry,
}: {
  overview: DashboardOverview;
  portfolios: Portfolio[];
  automation: DashboardAutomationSummary;
  activity: DashboardActivityItem[];
  wallet: WalletConnection;
  loadState: DashboardLoadState;
  onConnect: () => void;
  onRetry: () => void;
}) {
  const [period, setPeriod] = useState<ChartPeriod>("30d");

  if (wallet.state === "disconnected") {
    return (
      <section className="app-panel border app-border-accent-blue p-5 md:p-7">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="app-display text-xl font-bold text-app-ink">
            Personal Snapshot
          </h2>
          <span className="rounded-full bg-app-panel px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-dim">
            Secondary
          </span>
        </div>
        <p className="max-w-2xl text-sm text-app-muted">
          Connect your wallet to view your portfolio, automation and rewards.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConnect}
            className="app-gradient-btn rounded-xl px-5 py-2.5 text-sm font-bold"
          >
            Connect Wallet
          </button>
          <Link
            href={APP_ROUTES.discover}
            className="rounded-xl border border-app-line px-5 py-2.5 text-sm font-bold text-app-ink hover:bg-app-panel"
          >
            Continue Exploring
          </Link>
        </div>
        <p className="mt-4 text-xs text-app-dim">
          Wallet not connected — marketplace discovery stays available above.
        </p>
      </section>
    );
  }

  if (loadState === "loading") {
    return (
      <section className="app-panel p-5 md:p-7">
        <LoadingSkeleton title="Loading personal snapshot" lines={5} />
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="app-panel p-5 md:p-7">
        <ErrorState
          description="Unable to load personal snapshot. No transaction was executed."
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

  const positive = overview.return30dPercent >= 0;

  return (
    <section className="app-panel-glow border app-border-accent-blue p-5 md:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="app-display text-xl font-bold text-app-ink md:text-2xl">
              Personal Snapshot
            </h2>
            {overview.isIllustrative ? <IllustrativeBadge /> : null}
          </div>
          <p className="mt-1 text-sm text-app-muted">
            Compact view of holdings, automation and activity — full detail lives in My Portfolio.
          </p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Total Portfolio Value"
          value={formatUsd(overview.totalValueUsd)}
          large
        />
        <Metric
          label="Total return"
          value={`${formatUsdSigned(overview.totalReturnUsd)} · ${formatPercent(overview.totalReturnPercent, true)}`}
          accent={positive ? "success" : "danger"}
        />
        <Metric
          label="Active portfolios"
          value={String(overview.activePortfolioCount)}
        />
        <Metric
          label="Active automations"
          value={String(overview.activeAutomations)}
          accent="violet"
        />
        <Metric
          label="Claimable rewards"
          value={
            overview.claimableRewardsUsd != null
              ? formatUsd(overview.claimableRewardsUsd)
              : "—"
          }
          accent="amber"
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="app-panel-soft p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-app-dim">
              Performance · {period.toUpperCase()}
            </p>
            <p
              className={[
                "text-sm font-bold",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(overview.return30dPercent, true)} (30D)
            </p>
          </div>
          <div className="h-36 md:h-40">
            <MiniLineChart points={overview.chartSeries[period]} height={160} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="app-panel-soft p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-app-dim">
              Active portfolios
            </p>
            <div className="mt-3 space-y-2.5">
              {portfolios.slice(0, 3).map((portfolio) => (
                <div
                  key={portfolio.id}
                  className="flex items-center gap-3"
                >
                  <AssetIconStack
                    assetIds={portfolio.assets.map((a) => a.assetId)}
                    size={22}
                    max={3}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-app-ink">
                      {portfolio.name}
                    </p>
                    <p className="text-xs text-app-dim">
                      {formatUsd(portfolio.valueUsd)}
                    </p>
                  </div>
                  <p
                    className={[
                      "text-xs font-bold",
                      portfolio.performance30d >= 0
                        ? "text-app-success"
                        : "text-app-danger",
                    ].join(" ")}
                  >
                    {formatPercent(portfolio.performance30d, true)}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="app-panel-soft p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-app-dim">
              Automation
            </p>
            <p className="mt-2 text-sm font-semibold text-app-ink">
              {automation.activeRules} active rules
            </p>
            <p className="mt-1 text-xs text-app-muted">
              {automation.nextScheduledAction}
            </p>
          </div>
        </div>
      </div>

      {activity.length > 0 ? (
        <div className="mt-5 app-panel-soft p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-app-dim">
            Recent activity preview
          </p>
          <ul className="mt-3 space-y-2">
            {activity.slice(0, 3).map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-app-line pb-2 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-semibold text-app-ink">{item.title}</p>
                  <p className="text-xs text-app-dim">
                    {item.subtitle} · {formatRelativeTime(item.timestamp)}
                  </p>
                </div>
                <p className="text-xs font-bold text-app-muted">
                  {item.amountUsd != null
                    ? formatUsd(item.amountUsd)
                    : item.amountDexla != null
                      ? formatDexla(item.amountDexla)
                      : item.status}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={APP_ROUTES.portfolio}
          className="app-gradient-btn rounded-xl px-4 py-2.5 text-sm font-bold"
        >
          Open My Portfolio
        </Link>
        <Link
          href={`${APP_ROUTES.portfolio}?tab=automation`}
          className="rounded-xl border border-app-brand/30 px-4 py-2.5 text-sm font-bold text-app-brand hover:bg-app-soft"
        >
          Manage Automations
        </Link>
        {overview.claimableRewardsUsd != null ? (
          <Link
            href={`${APP_ROUTES.portfolio}?action=claim`}
            className="rounded-xl border border-app-line px-4 py-2.5 text-sm font-bold text-app-ink hover:bg-app-panel"
          >
            Claim Rewards
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  accent,
  large,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger" | "violet" | "amber";
  large?: boolean;
}) {
  return (
    <div className="app-panel-soft p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-app-dim">
        {label}
      </p>
      <p
        className={[
          "mt-1 font-bold",
          large ? "app-metric text-2xl md:text-3xl" : "text-sm",
          accent === "success"
            ? "text-app-success"
            : accent === "danger"
              ? "text-app-danger"
              : accent === "violet"
                ? "text-[color:var(--color-accent-violet)]"
                : accent === "amber"
                  ? "text-[color:var(--color-accent-amber)]"
                  : "text-app-ink",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
