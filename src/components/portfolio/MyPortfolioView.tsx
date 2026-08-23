"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  ActivityFilter,
  MyPortfolioDetail,
  MyPortfolioTab,
  MyPortfolioWorkspace,
  NotificationPreferences,
} from "@/lib/domain/my-portfolio";
import type { ChartPeriod } from "@/lib/domain/dashboard";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { PeriodTabs } from "@/components/ui/PeriodTabs";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import {
  formatDexla,
  formatPercent,
  formatRelativeTime,
  formatUsd,
  formatUsdSigned,
} from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import {
  ProductTypeBadge,
} from "@/components/product/ProductIdentity";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import {
  PreviewOnlyMessage,
  formatPreviewOnly,
} from "@/components/ui/PreviewOnlyMessage";

const TABS: { id: MyPortfolioTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "assets", label: "Assets" },
  { id: "automation", label: "Automation" },
  { id: "activity", label: "Activity / History" },
  { id: "notifications", label: "Notifications" },
];

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "buy", label: "Buys" },
  { id: "sell", label: "Sells" },
  { id: "swap", label: "Swaps" },
  { id: "rebalance", label: "Rebalances" },
  { id: "dca", label: "DCA" },
  { id: "bridge", label: "Bridges" },
  { id: "tip", label: "Tips" },
  { id: "strategy-access", label: "Strategy access" },
];

type ViewState = "loading" | "ready" | "error" | "empty";

export function MyPortfolioView({
  workspace,
  illustrative,
  initialError = false,
}: {
  workspace: MyPortfolioWorkspace;
  illustrative: boolean;
  initialError?: boolean;
}) {
  const { wallet, connectDemo } = useDemoWallet();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [viewState, setViewState] = useState<ViewState>(
    initialError ? "error" : "loading",
  );
  const [period, setPeriod] = useState<ChartPeriod>("30d");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    workspace.notificationPrefs,
  );
  const [automationStatus, setAutomationStatus] = useState<
    Record<string, "active" | "paused">
  >({});

  const selectedId =
    searchParams.get("selected") ??
    workspace.portfolios[0]?.id ??
    null;
  const tab = (searchParams.get("tab") as MyPortfolioTab | null) ?? "overview";
  const action = searchParams.get("action");
  const [highlightRewards, setHighlightRewards] = useState(false);
  const [buyDexlaOpen, setBuyDexlaOpen] = useState(false);

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => {
      setViewState(workspace.portfolios.length === 0 ? "empty" : "ready");
    }, 280);
    return () => window.clearTimeout(timer);
  }, [workspace.portfolios.length, initialError]);

  const detail: MyPortfolioDetail | null = useMemo(() => {
    if (!selectedId) return null;
    return workspace.detailsById[selectedId] ?? null;
  }, [selectedId, workspace.detailsById]);

  function syncParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function preview(actionLabel: string) {
    setMessage(formatPreviewOnly(actionLabel));
  }

  useEffect(() => {
    if (!action) return;
    if (action === "claim") {
      syncParams({ tab: "overview", action: null });
      setHighlightRewards(true);
      setMessage(formatPreviewOnly("Opened Investor Rewards"));
    }
    if (action === "buy-dexla") {
      syncParams({ tab: "overview", action: null });
      setBuyDexlaOpen(true);
      setMessage(formatPreviewOnly("Opened Buy $DEXLA"));
    }
    // Intentionally depend on action query only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  useEffect(() => {
    if (wallet.state !== "connected" || !highlightRewards) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("portfolio-investor-rewards")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [wallet.state, highlightRewards, viewState]);

  if (wallet.state !== "connected") {
    const pendingBuy = buyDexlaOpen;
    const pendingClaim = highlightRewards;
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <div className="app-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="app-display text-lg font-bold text-app-ink">
              Wallet disconnected
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Connect your wallet to manage holdings, automation and rewards.
              Discovery remains available without a wallet.
            </p>
            {pendingBuy || pendingClaim ? (
              <PreviewOnlyMessage className="mt-3">
                {pendingBuy
                  ? "Buy $DEXLA preview will open after you connect."
                  : "Investor Rewards / Claim will open after you connect."}
              </PreviewOnlyMessage>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={connectDemo}
              className="app-gradient-btn h-10 rounded-[10px] px-4 text-sm font-bold"
            >
              Connect Wallet
            </button>
            <Link
              href={APP_ROUTES.discover}
              className="inline-flex h-10 items-center rounded-[10px] border border-app-line px-4 text-sm font-bold"
            >
              Discover
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === "loading") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <LoadingSkeleton title="Loading My Portfolio" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <ErrorState
          title="Portfolio unavailable"
          description="Unable to load portfolio data. No transaction was executed."
          action={
            <button
              type="button"
              className="app-gradient-btn rounded-[10px] px-4 py-2 text-sm font-bold"
              onClick={() =>
                setViewState(
                  workspace.portfolios.length === 0 ? "empty" : "ready",
                )
              }
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  if (viewState === "empty" || !detail) {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <EmptyState
          title="You have not created or invested in a portfolio yet."
          description="Browse the marketplace or create your first portfolio/index."
          action={
            <div className="flex flex-wrap gap-2">
              <Link
                href={APP_ROUTES.discover}
                className="app-gradient-btn inline-flex h-10 items-center rounded-[10px] px-4 text-sm font-bold"
              >
                Discover
              </Link>
              <Link
                href={APP_ROUTES.create}
                className="inline-flex h-10 items-center rounded-[10px] border border-app-line px-4 text-sm font-bold"
              >
                Create Portfolio / Index
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const autoStatus =
    automationStatus[detail.summary.id] ?? detail.automation.status;
  const periodReturn = detail.periodPerformance[period];
  const pnlPositive = detail.allTimePnlUsd >= 0;

  return (
    <div className="mx-auto space-y-5" style={{ maxWidth: "var(--content-max)" }}>
      <Header illustrative={illustrative} />

      <section className="app-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-app-ink">Your portfolios</h2>
          <Link
            href={APP_ROUTES.create}
            className="app-gradient-btn rounded-[10px] px-3 py-1.5 text-[12px] font-bold text-white"
          >
            Create Portfolio / Index
          </Link>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {workspace.portfolios.map((item) => {
            const selected = item.id === detail.summary.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => syncParams({ selected: item.id })}
                className={[
                  "rounded-[10px] border p-3 text-left transition-colors",
                  selected
                    ? "border-app-brand/50 bg-app-soft"
                    : "border-app-line bg-app-elevated hover:border-app-brand/30",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-bold text-app-ink">
                    {item.name}
                  </p>
                  <ProductTypeBadge kind={item.kind} />
                </div>
                <p className="mt-1 text-[11px] text-app-dim">
                  {item.visibility} · {item.status}
                </p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <p className="app-metric text-base text-app-ink">
                    {formatUsd(item.valueUsd)}
                  </p>
                  <p
                    className={[
                      "text-[12px] font-bold",
                      item.performance30d >= 0
                        ? "text-app-success"
                        : "text-app-danger",
                    ].join(" ")}
                  >
                    {formatPercent(item.performance30d, true)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="My Portfolio tabs"
      >
        {TABS.map((item) => {
          const selected = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => syncParams({ tab: item.id })}
              className={[
                "app-page-tab app-interactive",
                selected ? "app-page-tab-active" : "",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {message ? <PreviewOnlyMessage>{message}</PreviewOnlyMessage> : null}

      {tab === "overview" ? (
        <section className="space-y-4">
          {detail.marketDataStale ? (
            <p className="rounded-[10px] border border-app-warning/40 bg-app-warning/10 px-3 py-2 text-xs text-app-warning">
              Market data may be stale — figures remain illustrative.
            </p>
          ) : null}
          {detail.riskLevel === "Extreme" ? (
            <p
              className="rounded-[10px] border border-app-danger/40 bg-app-danger/10 px-3 py-2 text-sm text-app-danger"
              role="alert"
            >
              EXTREME RISK — {detail.riskSummary}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Total value" value={formatUsd(detail.summary.valueUsd)} />
            <Metric label="Total invested" value={formatUsd(detail.investedUsd)} />
            <Metric
              label="All-time P&L"
              value={`${formatUsdSigned(detail.allTimePnlUsd)} · ${formatPercent(detail.allTimePnlPercent, true)}`}
              tone={pnlPositive ? "success" : "danger"}
            />
            <Metric
              label="Available balance"
              value={formatUsd(detail.availableUsd)}
            />
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr]">
            <div className="app-panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="app-label">Period performance</p>
                  <p
                    className={[
                      "app-metric text-2xl",
                      periodReturn >= 0 ? "text-app-success" : "text-app-danger",
                    ].join(" ")}
                  >
                    {formatPercent(periodReturn, true)}
                  </p>
                </div>
                <PeriodTabs value={period} onChange={setPeriod} />
              </div>
              <MiniLineChart points={detail.chartSeries[period]} height={160} />
            </div>
            <div className="app-panel space-y-3 p-4">
              <h3 className="text-sm font-bold text-app-ink">Allocation</h3>
              <AllocationDonut
                segments={detail.assets.map((a) => ({
                  label: a.symbol,
                  percent: a.allocationPercent,
                }))}
                size={96}
              />
              <ul className="space-y-1 text-xs">
                {detail.assets.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="font-semibold text-app-ink">{a.symbol}</span>
                    <span className="text-app-muted">
                      {a.allocationPercent}% · {formatUsd(a.valueUsd, true)}
                    </span>
                  </li>
                ))}
              </ul>
              <h4 className="pt-2 text-xs font-bold uppercase tracking-wide text-app-dim">
                Networks
              </h4>
              <ul className="space-y-1 text-xs">
                {detail.networkAllocations.map((n) => (
                  <li key={n.networkId} className="flex justify-between gap-2">
                    <span className="text-app-ink">{n.label}</span>
                    <span className="text-app-muted">{n.percent}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Active strategy" value={detail.automation.strategyName} />
            <Metric
              label="Next automation"
              value={
                detail.automation.nextExecutionAt
                  ? formatRelativeTime(detail.automation.nextExecutionAt)
                  : "Paused"
              }
            />
            <Metric label="Risk summary" value={detail.riskSummary} />
            <Metric
              label="$DEXLA Save"
              value={`Tier ${workspace.dexla.tier} · ~${formatUsd(detail.estimatedSaveUsd)} est.`}
            />
          </div>

          <div
            id="portfolio-investor-rewards"
            className={[
              "app-panel flex flex-wrap items-center justify-between gap-3 p-4",
              highlightRewards
                ? "ring-2 ring-app-brand/50 border-app-brand/40"
                : "",
            ].join(" ")}
          >
            <div>
              <p className="text-sm font-bold text-app-ink">Investor rewards</p>
              <p className="mt-1 text-xs text-app-muted">
                {detail.rewards.eligible
                  ? `${detail.rewards.rankHint} · claimable ${formatUsd(detail.rewards.claimableUsd ?? 0)}`
                  : `${detail.rewards.rankHint} · not currently eligible`}
              </p>
              <p className="mt-1 text-[11px] text-app-muted">
                Eligible rewards for this Portfolio / Index only. USD amounts
                stay separate from any $DEXLA tips.
              </p>
            </div>
            <button
              type="button"
              disabled={!detail.rewards.eligible}
              onClick={() => preview("Claim Rewards")}
              className="h-10 app-gradient-btn rounded-[10px] px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              Claim Rewards
            </button>
          </div>
        </section>
      ) : null}

      {buyDexlaOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="buy-dexla-title"
        >
          <div className="w-full max-w-md space-y-4 rounded-[14px] border border-app-line bg-app-elevated p-5 shadow-xl">
            <h3
              id="buy-dexla-title"
              className="app-display text-lg font-bold text-app-ink"
            >
              Buy $DEXLA
            </h3>
            <p className="text-sm text-app-muted">
              Preview purchase flow only. $DEXLA balance stays separate from USD
              portfolio value. No real payment or on-chain transfer.
            </p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-[10px] border border-app-line bg-app-soft p-3">
                <dt className="text-app-muted">Demo balance</dt>
                <dd className="mt-1 font-bold text-app-ink">
                  {formatDexla(workspace.dexla.balance)}
                </dd>
              </div>
              <div className="rounded-[10px] border border-app-line bg-app-soft p-3">
                <dt className="text-app-muted">Save tier</dt>
                <dd className="mt-1 font-bold text-app-ink">
                  {workspace.dexla.tier} · {workspace.dexla.discountPercent}%
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setBuyDexlaOpen(false)}
                className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  preview("Buy $DEXLA · 500");
                  setBuyDexlaOpen(false);
                }}
                className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
              >
                Confirm Buy Preview
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "assets" ? (
        <section className="app-panel overflow-x-auto p-4">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-app-dim">
              <tr>
                <th className="pb-2 pr-3">Asset</th>
                <th className="pb-2 pr-3">Network</th>
                <th className="pb-2 pr-3">Balance</th>
                <th className="pb-2 pr-3">USD</th>
                <th className="pb-2 pr-3">Alloc / Target</th>
                <th className="pb-2 pr-3">Drift</th>
                <th className="pb-2 pr-3">Perf</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-line">
              {detail.assets.map((asset) => (
                <tr key={asset.id}>
                  <td className="py-3 pr-3 font-semibold text-app-ink">
                    {asset.name}{" "}
                    <span className="text-app-dim">{asset.symbol}</span>
                  </td>
                  <td className="py-3 pr-3 capitalize text-app-muted">
                    {asset.networkId}
                  </td>
                  <td className="py-3 pr-3 text-app-ink">
                    {asset.balance.toFixed(4)}
                  </td>
                  <td className="py-3 pr-3 text-app-ink">
                    {formatUsd(asset.valueUsd)}
                  </td>
                  <td className="py-3 pr-3 text-app-muted">
                    {asset.allocationPercent}% / {asset.targetPercent}%
                  </td>
                  <td
                    className={[
                      "py-3 pr-3 font-semibold",
                      asset.driftPercent >= 0
                        ? "text-app-warning"
                        : "text-app-danger",
                    ].join(" ")}
                  >
                    {formatPercent(asset.driftPercent, true)}
                  </td>
                  <td
                    className={[
                      "py-3 pr-3 font-semibold",
                      asset.performance24h >= 0
                        ? "text-app-success"
                        : "text-app-danger",
                    ].join(" ")}
                  >
                    {formatPercent(asset.performance24h, true)}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {(["Buy", "Sell", "Swap"] as const).map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => preview(`${action} ${asset.symbol}`)}
                          className="rounded-md border border-app-line px-2 py-1 text-[11px] font-bold text-app-ink"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "automation" ? (
        <section className="space-y-4">
          {autoStatus === "paused" ? (
            <p className="rounded-[10px] border border-app-warning/40 bg-app-warning/10 px-3 py-2 text-sm text-app-warning">
              Automation is paused for this portfolio.
            </p>
          ) : null}
          {detail.automation.permissionHealth === "expired" ? (
            <p className="rounded-[10px] border border-app-danger/40 bg-app-danger/10 px-3 py-2 text-sm text-app-danger">
              Permission session expired — renew required before automation can
              run (preview only).
            </p>
          ) : null}
          {detail.automation.permissionHealth === "expiring" ? (
            <p className="rounded-[10px] border border-app-warning/40 bg-app-warning/10 px-3 py-2 text-sm text-app-warning">
              Permission session expiring{" "}
              {formatRelativeTime(detail.automation.permissionExpiresAt)}.
            </p>
          ) : null}

          <div className="app-panel grid gap-3 p-4 sm:grid-cols-2">
            <Row label="Strategy" value={detail.automation.strategyName} />
            <Row label="Status" value={autoStatus} />
            <Row label="Condition" value={detail.automation.condition} />
            <Row label="Action" value={detail.automation.action} />
            <Row label="Frequency" value={detail.automation.frequency} />
            <Row
              label="Next execution"
              value={
                detail.automation.nextExecutionAt && autoStatus === "active"
                  ? formatRelativeTime(detail.automation.nextExecutionAt)
                  : "—"
              }
            />
            <Row
              label="Previous execution"
              value={
                detail.automation.lastExecutionAt
                  ? formatRelativeTime(detail.automation.lastExecutionAt)
                  : "—"
              }
            />
            <Row
              label="Slippage"
              value={`${detail.automation.slippageBps} bps`}
            />
            <Row
              label="Trade / daily limits"
              value={`${formatUsd(detail.automation.tradeLimitUsd)} / ${formatUsd(detail.automation.dailyLimitUsd)}`}
            />
            <Row label="Expiry" value={detail.automation.expiry} />
            <Row
              label="Circuit breaker"
              value={detail.automation.circuitBreaker ? "Enabled" : "Off"}
            />
            <Row
              label="Permission health"
              value={detail.automation.permissionHealth}
            />
            <div className="sm:col-span-2">
              <p className="text-xs text-app-dim">Permission scope</p>
              <p className="mt-1 text-sm text-app-ink">
                {detail.automation.permissionScope}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="h-10 app-gradient-btn rounded-[10px] px-4 text-sm font-bold text-white"
              onClick={() => {
                setAutomationStatus((prev) => ({
                  ...prev,
                  [detail.summary.id]:
                    autoStatus === "active" ? "paused" : "active",
                }));
                preview(autoStatus === "active" ? "Pause" : "Resume");
              }}
            >
              {autoStatus === "active" ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              className="h-10 rounded-[10px] border border-app-line px-4 text-sm font-bold"
              onClick={() => preview("Edit Limits")}
            >
              Edit Limits
            </button>
            <button
              type="button"
              className="h-10 rounded-[10px] border border-app-danger/40 px-4 text-sm font-bold text-app-danger"
              onClick={() => preview("Revoke Permission")}
            >
              Revoke Permission
            </button>
          </div>
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivityFilter(item.id)}
                  className={[
                    "h-8 rounded-full px-3 text-[11px] font-bold",
                    activityFilter === item.id
                      ? "bg-app-brand text-white"
                      : "border border-app-line text-app-muted",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => preview("Export activity")}
              className="h-8 rounded-[10px] border border-app-line px-3 text-[11px] font-bold"
            >
              Export preview
            </button>
          </div>
          <p className="text-[11px] text-app-dim">
            Illustrative activity only — never genuine on-chain execution.
          </p>
          <ul className="space-y-2">
            {detail.activity
              .filter(
                (item) =>
                  activityFilter === "all" || item.type === activityFilter,
              )
              .map((item) => (
                <li key={item.id} className="app-panel p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-app-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-app-brand">
                          {item.type}
                        </span>
                        <p className="font-bold text-app-ink">{item.title}</p>
                        <IllustrativeBadge compact />
                      </div>
                      <p className="mt-1 text-app-muted">
                        {item.assetLabel} · {item.status} ·{" "}
                        {formatRelativeTime(item.timestamp)}
                      </p>
                    </div>
                    <div className="text-right">
                      {item.amountUsd != null ? (
                        <p className="font-bold text-app-ink">
                          {formatUsd(item.amountUsd)}
                        </p>
                      ) : null}
                      {item.amountDexla != null ? (
                        <p className="text-xs text-app-dim">
                          {formatDexla(item.amountDexla)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs text-app-muted sm:grid-cols-2 lg:grid-cols-3">
                    <div>Provider: {item.provider.toUpperCase()}</div>
                    <div>CoW MEV: {item.mevStatus}</div>
                    <div>Routing: {item.routingStatus}</div>
                    <div>Gas: {formatUsd(item.gasUsd)}</div>
                    <div>Bridge: {formatUsd(item.bridgeUsd)}</div>
                    <div>Routing fee: {formatUsd(item.routingUsd)}</div>
                    <div>Execution fee: {formatUsd(item.executionFeeUsd)}</div>
                    <div className="sm:col-span-2">
                      Tx link:{" "}
                      <span className="text-app-brand">
                        {item.txLinkPlaceholder}
                      </span>
                    </div>
                  </dl>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {tab === "notifications" ? (
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <ul className="space-y-2">
            {workspace.notifications.map((item) => (
              <li key={item.id} className="app-panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-app-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-app-brand">
                    {item.category}
                  </span>
                  {item.unread ? (
                    <span className="text-[10px] font-bold uppercase text-app-warning">
                      Unread
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-bold text-app-ink">{item.title}</p>
                <p className="mt-1 text-sm text-app-muted">{item.body}</p>
                <p className="mt-2 text-[11px] text-app-dim">
                  {formatRelativeTime(item.createdAt)}
                </p>
                {item.actionable === "claim-rewards" ? (
                  <button
                    type="button"
                    className="mt-3 h-9 app-gradient-btn rounded-[10px] px-3 text-xs font-bold text-white"
                    onClick={() => preview("Claim Rewards")}
                  >
                    Claim Rewards
                  </button>
                ) : null}
                {item.actionable === "review-permission" ? (
                  <button
                    type="button"
                    className="mt-3 h-9 rounded-[10px] border border-app-line px-3 text-xs font-bold"
                    onClick={() => {
                      syncParams({ tab: "automation" });
                      preview("Review permission");
                    }}
                  >
                    Review permission
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <aside className="app-panel h-fit space-y-3 p-4">
            <h3 className="text-sm font-bold text-app-ink">
              Notification preferences
            </h3>
            {(
              Object.keys(prefs) as Array<keyof NotificationPreferences>
            ).map((key) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 text-sm text-app-ink"
              >
                <span className="capitalize">
                  {key.replace(/([A-Z])/g, " $1")}
                </span>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={(e) =>
                    setPrefs((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />
              </label>
            ))}
            <p className="text-[11px] text-app-dim">
              Preferences are preview-local and not persisted to a backend.
            </p>
          </aside>
        </section>
      ) : null}
    </div>
  );
}

function Header({ illustrative }: { illustrative: boolean }) {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="app-display text-2xl font-bold text-app-ink sm:text-[1.75rem]">
          My Portfolio
        </h1>
        {illustrative ? <IllustrativeBadge compact /> : null}
      </div>
      <p className="mt-1 text-sm text-app-muted">
        Holdings, automation, activity and rewards — preview data only.
      </p>
    </header>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="app-panel p-3.5">
      <p className="app-label">{label}</p>
      <p
        className={[
          "mt-1 text-sm font-bold text-app-ink",
          tone === "success" ? "text-app-success" : "",
          tone === "danger" ? "text-app-danger" : "",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-app-dim">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-app-ink">{value}</p>
    </div>
  );
}
