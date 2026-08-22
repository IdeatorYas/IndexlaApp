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
      <section className="app-panel overflow-hidden app-accent-bar-blue px-4 py-4 sm:px-5">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="app-display text-[16px] font-bold text-app-ink">
            Personal Snapshot
          </h2>
          <span className="rounded-md bg-app-panel px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-dim">
            Secondary
          </span>
        </div>
        <p className="max-w-2xl text-[13px] text-app-muted">
          Connect your wallet to view your portfolio, automation and rewards.
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConnect}
            className="app-gradient-btn h-9 rounded-[10px] px-4 text-[13px] font-bold"
          >
            Connect Wallet
          </button>
          <Link
            href={APP_ROUTES.discover}
            className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-4 text-[13px] font-bold text-app-ink hover:bg-app-panel"
          >
            Continue Exploring
          </Link>
        </div>
        <p className="mt-3 text-[11px] text-app-dim">
          Wallet not connected — marketplace discovery stays available above.
        </p>
      </section>
    );
  }

  if (loadState === "loading") {
    return (
      <section className="app-panel p-4">
        <LoadingSkeleton title="Loading personal snapshot" lines={4} />
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="app-panel p-4">
        <ErrorState
          description="Unable to load personal snapshot. No transaction was executed."
          action={
            <button
              type="button"
              onClick={onRetry}
              className="app-gradient-btn rounded-[10px] px-4 py-2 text-[13px] font-semibold"
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
    <section className="app-panel overflow-hidden app-accent-bar-blue p-4 sm:p-5">
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="app-display text-[16px] font-bold text-app-ink">
              Personal Snapshot
            </h2>
            {overview.isIllustrative ? <IllustrativeBadge compact /> : null}
          </div>
          <p className="mt-0.5 text-[12px] text-app-muted">
            Compact holdings view — full detail in My Portfolio.
          </p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
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

      <div className="mt-3.5 grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="app-panel-soft p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="app-label">Performance · {period.toUpperCase()}</p>
            <p
              className={[
                "text-[12px] font-bold",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(overview.return30dPercent, true)} (30D)
            </p>
          </div>
          <div className="h-28 md:h-32">
            <MiniLineChart points={overview.chartSeries[period]} height={128} />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="app-panel-soft p-3">
            <p className="app-label">Active portfolios</p>
            <div className="mt-2 space-y-2">
              {portfolios.slice(0, 3).map((portfolio) => (
                <div key={portfolio.id} className="flex items-center gap-2.5">
                  <AssetIconStack
                    assetIds={portfolio.assets.map((a) => a.assetId)}
                    size={20}
                    max={3}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-app-ink">
                      {portfolio.name}
                    </p>
                    <p className="text-[11px] text-app-dim">
                      {formatUsd(portfolio.valueUsd)}
                    </p>
                  </div>
                  <p
                    className={[
                      "text-[11px] font-bold",
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
          <div className="app-panel-soft p-3">
            <p className="app-label">Automation</p>
            <p className="mt-1.5 text-[13px] font-semibold text-app-ink">
              {automation.activeRules} active rules
            </p>
            <p className="mt-0.5 text-[11px] text-app-muted">
              {automation.nextScheduledAction}
            </p>
          </div>
        </div>
      </div>

      {activity.length > 0 ? (
        <div className="mt-3.5 app-panel-soft p-3">
          <p className="app-label">Recent activity preview</p>
          <ul className="mt-2 space-y-1.5">
            {activity.slice(0, 3).map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-app-line pb-1.5 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-[12px] font-semibold text-app-ink">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-app-dim">
                    {item.subtitle} · {formatRelativeTime(item.timestamp)}
                  </p>
                </div>
                <p className="text-[11px] font-bold text-app-muted">
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

      <div className="mt-3.5 flex flex-wrap gap-2">
        <Link
          href={APP_ROUTES.portfolio}
          className="app-gradient-btn inline-flex h-9 items-center rounded-[10px] px-4 text-[13px] font-bold"
        >
          Open My Portfolio
        </Link>
        <Link
          href={`${APP_ROUTES.portfolio}?tab=automation`}
          className="inline-flex h-9 items-center rounded-[10px] border border-app-brand/30 px-4 text-[13px] font-bold text-app-brand hover:bg-app-soft"
        >
          Manage Automations
        </Link>
        {overview.claimableRewardsUsd != null ? (
          <Link
            href={`${APP_ROUTES.portfolio}?action=claim`}
            className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-4 text-[13px] font-bold text-app-ink hover:bg-app-panel"
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
    <div className="app-panel-soft p-2.5">
      <p className="app-label">{label}</p>
      <p
        className={[
          "mt-1 font-bold",
          large ? "app-metric text-[1.35rem] leading-none" : "text-[13px]",
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
