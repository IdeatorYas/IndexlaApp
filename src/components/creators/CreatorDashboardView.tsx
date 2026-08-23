"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CreatorDashboardWorkspace } from "@/lib/domain/creator-dashboard";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { ProductTypeBadge } from "@/components/product/ProductIdentity";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  UtilityGateState,
} from "@/components/states/AppStates";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import {
  formatDexla,
  formatPercent,
  formatRelativeTime,
  formatUsd,
} from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import { readStoredActivationDraft } from "@/components/creators/useCreatorActivation";

type ViewState = "loading" | "ready" | "error";
type AccessState = "checking" | "locked" | "approved";

export function CreatorDashboardView({
  workspace,
  illustrative,
  featuredPlacementsEnabled,
  dexlaDemoMode,
  initialError = false,
}: {
  workspace: CreatorDashboardWorkspace;
  illustrative: boolean;
  featuredPlacementsEnabled: boolean;
  dexlaDemoMode: boolean;
  initialError?: boolean;
}) {
  const { wallet, connectDemo } = useDemoWallet();
  const [viewState, setViewState] = useState<ViewState>(
    initialError ? "error" : "loading",
  );
  const [access, setAccess] = useState<AccessState>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [featureConfirmId, setFeatureConfirmId] = useState<string | null>(null);
  const [earningsTab, setEarningsTab] = useState<"usd" | "dexla">("usd");
  const [audienceTab, setAudienceTab] = useState<
    "followers" | "notify" | "likes" | "investors"
  >("followers");
  const [staleOverride, setStaleOverride] = useState(workspace.marketDataStale);

  useEffect(() => {
    function syncAccess() {
      const draft = readStoredActivationDraft();
      setAccess(draft?.status === "approved" ? "approved" : "locked");
    }
    syncAccess();
    window.addEventListener("indexla-creator-activation-changed", syncAccess);
    window.addEventListener("storage", syncAccess);
    return () => {
      window.removeEventListener(
        "indexla-creator-activation-changed",
        syncAccess,
      );
      window.removeEventListener("storage", syncAccess);
    };
  }, []);

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => setViewState("ready"), 280);
    return () => window.clearTimeout(timer);
  }, [initialError]);

  function preview(action: string) {
    setMessage(
      `${action} — preview only. No real claim, tip, feature burn, share broadcast or transaction was submitted.`,
    );
  }

  function requireWallet(action: string): boolean {
    if (wallet.state === "connected") return true;
    connectDemo();
    preview(action);
    return false;
  }

  if (viewState === "loading" || access === "checking") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <LoadingSkeleton title="Loading creator dashboard" lines={7} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <ErrorState
          title="Creator dashboard unavailable"
          description="Unable to load creator dashboard preview."
          action={
            <button
              type="button"
              className="app-gradient-btn rounded-[10px] px-4 py-2 text-sm font-bold"
              onClick={() => setViewState("ready")}
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  if (access === "locked") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <EmptyState
          title="Creator Dashboard locked"
          description="Creator Dashboard is available only after creator-status approval. Continue activation to unlock earnings, live products and audience tools."
          action={
            <Link
              href={APP_ROUTES.creatorActivate}
              className="inline-flex h-10 items-center rounded-[10px] bg-app-brand px-4 text-sm font-bold text-white"
            >
              Continue Creator Setup
            </Link>
          }
        />
      </div>
    );
  }

  const { identity, overview, usdEarnings, dexlaEarnings } = workspace;
  const audienceSeries =
    audienceTab === "followers"
      ? workspace.audience.followerSeries
      : audienceTab === "notify"
        ? workspace.audience.notificationSeries
        : audienceTab === "likes"
          ? workspace.audience.likesSeries
          : workspace.audience.investorSeries;

  const earningsSeries =
    earningsTab === "usd"
      ? usdEarnings.chartSeries
      : dexlaEarnings.chartSeries;

  const noProducts = workspace.liveProducts.length === 0;
  const noEarnings =
    usdEarnings.totalEarnedUsd === 0 && dexlaEarnings.totalEarnedDexla === 0;

  return (
    <div className="mx-auto space-y-5" style={{ maxWidth: "var(--content-max)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={APP_ROUTES.creators}
          className="text-sm font-bold text-app-brand hover:underline"
        >
          ← Creators
        </Link>
        {illustrative ? (
          <span className="rounded-full bg-app-warning/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-app-warning">
            Illustrative
          </span>
        ) : null}
      </div>

      {wallet.state !== "connected" ? (
        <div className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">Wallet disconnected</p>
            <p className="mt-0.5 text-xs text-app-muted">
              Browse dashboard freely. Connect for claim, feature and share
              previews.
            </p>
          </div>
          <button
            type="button"
            onClick={connectDemo}
            className="h-9 rounded-[10px] bg-app-brand px-4 text-[12px] font-bold text-white"
          >
            Connect Wallet
          </button>
        </div>
      ) : null}

      {staleOverride || workspace.marketDataStale ? (
        <div
          className="rounded-[10px] border border-app-warning/40 bg-app-warning/10 px-3 py-2 text-xs text-app-ink"
          role="status"
        >
          Market data may be stale — AUM, volume, earnings and analytics remain
          Illustrative.
          <button
            type="button"
            className="ml-2 font-bold underline"
            onClick={() => setStaleOverride(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-[10px] border border-app-line bg-app-soft px-3 py-2 text-xs text-app-muted">
          {message}
        </p>
      ) : null}

      {/* 1. Identity */}
      <section className="app-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <CreatorAvatar
            initials={identity.avatarInitials}
            hue={identity.avatarHue}
            size={72}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="app-display text-2xl font-bold text-app-ink">
                {identity.displayName}
              </h1>
              {identity.verified ? (
                <span className="rounded-md bg-app-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-brand">
                  Verified
                </span>
              ) : null}
            </div>
            <p className="text-sm font-semibold text-app-muted">
              @{identity.handle} · {identity.specialty} · Creator since{" "}
              {new Date(identity.creatorSince).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </p>
            <p className="max-w-2xl text-sm text-app-muted">{identity.bio}</p>
            <div className="flex flex-wrap gap-2">
              {identity.socials.map((s) => (
                <a
                  key={s.platform}
                  href={s.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[10px] border border-app-line bg-app-elevated px-2.5 py-1 text-[11px] font-bold text-app-ink"
                >
                  {s.platform}: {s.connected ? s.handle : "Not connected"}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={APP_ROUTES.creatorProfile(identity.handle)}
            className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
          >
            View Public Profile
          </Link>
          <button
            type="button"
            onClick={() => {
              if (!requireWallet("Share Creator Profile")) return;
              const url =
                typeof window !== "undefined"
                  ? `${window.location.origin}${APP_ROUTES.creatorProfile(identity.handle)}`
                  : APP_ROUTES.creatorProfile(identity.handle);
              void navigator.clipboard?.writeText(url);
              preview(`Share Creator Profile · ${url}`);
            }}
            className="h-9 rounded-[10px] bg-app-brand px-3 text-[12px] font-bold text-white"
          >
            Share Creator Profile
          </button>
        </div>
      </section>

      {/* 2. Overview */}
      <section className="space-y-2">
        <h2 className="app-display text-base font-semibold text-app-ink">
          Creator overview
        </h2>
        <p className="text-[11px] text-app-muted">
          Likes and follows are engagement metrics only and never affect
          Portfolio Leaderboard ranking.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total AUM" value={formatUsd(overview.totalAumUsd, true)} />
          <MetricCard
            label="30-day volume"
            value={formatUsd(overview.volume30dUsd, true)}
          />
          <MetricCard label="Followers" value={overview.followers.toLocaleString()} />
          <MetricCard
            label="Notification subscribers"
            value={overview.notificationSubscribers.toLocaleString()}
          />
          <MetricCard
            label="Investors/copiers"
            value={overview.investorsCopiers.toLocaleString()}
          />
          <MetricCard
            label="Live public products"
            value={String(overview.liveProductCount)}
          />
          <MetricCard
            label="Total $DEXLA tips"
            value={formatDexla(overview.totalTipsDexla)}
          />
          <MetricCard
            label="Portfolio likes"
            value={overview.portfolioLikes.toLocaleString()}
          />
        </div>
      </section>

      {/* 3. Earnings */}
      <section className="app-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="app-display text-base font-semibold text-app-ink">
            Earnings Overview
          </h2>
          <div
            className="flex max-w-full gap-1 overflow-x-auto pb-0.5"
            role="tablist"
            aria-label="Earnings currency"
          >
            {(
              [
                ["usd", "USD"],
                ["dexla", "$DEXLA"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={earningsTab === id}
                onClick={() => setEarningsTab(id)}
                className={[
                  "h-8 shrink-0 rounded-full px-3 text-[11px] font-bold",
                  earningsTab === id
                    ? "bg-app-brand text-white"
                    : "border border-app-line text-app-muted",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-app-muted">
          USD and $DEXLA are separate ledgers. They are never combined into one
          total.
        </p>

        {noEarnings ? (
          <EmptyState
            title="No earnings yet"
            description="Execution fees, tips, strategy revenue and monthly rewards will appear here."
          />
        ) : earningsTab === "usd" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Total earned (USD)"
                value={formatUsd(usdEarnings.totalEarnedUsd, true)}
              />
              <MetricCard
                label="Available to claim (USD)"
                value={formatUsd(usdEarnings.availableUsd, true)}
              />
              <MetricCard
                label="Previously claimed (USD)"
                value={formatUsd(usdEarnings.claimedUsd, true)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="1. Portfolio execution-fee revenue"
                value={formatUsd(usdEarnings.portfolioExecutionFeesUsd, true)}
              />
              <MetricCard
                label="4. Monthly Creator Rewards"
                value={formatUsd(usdEarnings.monthlyCreatorRewardsUsd, true)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Total earned ($DEXLA)"
                value={formatDexla(dexlaEarnings.totalEarnedDexla)}
              />
              <MetricCard
                label="Available to claim ($DEXLA)"
                value={formatDexla(dexlaEarnings.availableDexla)}
              />
              <MetricCard
                label="Previously claimed ($DEXLA)"
                value={formatDexla(dexlaEarnings.claimedDexla)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="2. Private strategy revenue"
                value={formatDexla(dexlaEarnings.privateStrategyRevenueDexla)}
              />
              <MetricCard
                label="3. $DEXLA tips"
                value={formatDexla(dexlaEarnings.tipsDexla)}
              />
            </div>
          </>
        )}

        <div className="h-40 rounded-[12px] border border-app-line bg-app-soft p-2">
          <MiniLineChart points={earningsSeries} height={144} />
        </div>

        <div>
          <h3 className="text-sm font-bold text-app-ink">Monthly history</h3>
          <ul className="mt-2 space-y-1.5 text-xs text-app-muted">
            {earningsTab === "usd"
              ? usdEarnings.monthlyHistory.map((row) => (
                  <li key={row.month}>
                    {row.month}: execution fees{" "}
                    {formatUsd(row.executionFeesUsd, true)} · rewards{" "}
                    {formatUsd(row.monthlyRewardsUsd, true)}
                  </li>
                ))
              : dexlaEarnings.monthlyHistory.map((row) => (
                  <li key={row.month}>
                    {row.month}: tips {formatDexla(row.tipsDexla)} · strategy{" "}
                    {formatDexla(row.privateStrategyDexla)}
                  </li>
                ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (!requireWallet("Claim Rewards")) return;
              preview(
                earningsTab === "usd"
                  ? `Claim Rewards · ${formatUsd(usdEarnings.availableUsd, true)}`
                  : `Claim Rewards · ${formatDexla(dexlaEarnings.availableDexla)}`,
              );
            }}
            className="h-9 rounded-[10px] bg-app-brand px-3 text-[12px] font-bold text-white"
          >
            Claim Rewards
          </button>
          <button
            type="button"
            onClick={() => {
              if (!requireWallet("Claim Revenue")) return;
              preview("Claim Revenue");
            }}
            className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
          >
            Claim Revenue
          </button>
        </div>
      </section>

      {/* 4. Live products */}
      <section className="space-y-3">
        <h2 className="app-display text-base font-semibold text-app-ink">
          Live products
        </h2>
        {noProducts ? (
          <EmptyState
            title="No live products"
            description="Publish a public portfolio or index to see per-product earnings and Feature Portfolio."
            action={
              <Link
                href={APP_ROUTES.create}
                className="inline-flex h-10 items-center rounded-[10px] bg-app-brand px-4 text-sm font-bold text-white"
              >
                Create Portfolio / Index
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {workspace.liveProducts.map((product) => (
              <article key={product.id} className="app-panel flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ProductTypeBadge kind={product.kind} />
                      <span className="rounded-md bg-app-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-warning">
                        Illustrative
                      </span>
                      {product.featurePlacement.active ? (
                        <span className="rounded-md bg-app-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-brand">
                          Featured
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-app-ink">
                      {product.name}
                    </h3>
                    <p className="text-[11px] text-app-muted">
                      {product.portfolioLeaderboardRank
                        ? `Portfolio LB #${product.portfolioLeaderboardRank}`
                        : "Unranked"}
                    </p>
                  </div>
                  <AllocationDonut
                    segments={product.allocations.map((a) => ({
                      label: a.label,
                      percent: a.percent,
                    }))}
                    size={48}
                  />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                  <MiniMetric label="AUM" value={formatUsd(product.aumUsd, true)} />
                  <MiniMetric
                    label="Volume"
                    value={formatUsd(product.volumeUsd, true)}
                  />
                  <MiniMetric
                    label="Performance"
                    value={formatPercent(product.performance30d, true)}
                  />
                  <MiniMetric
                    label="Investors"
                    value={product.investors.toLocaleString()}
                  />
                  <MiniMetric label="Likes" value={String(product.likes)} />
                  <MiniMetric
                    label="$DEXLA tips"
                    value={formatDexla(product.tipsDexla)}
                  />
                  <MiniMetric
                    label="Generated fees"
                    value={formatUsd(product.generatedFeesUsd, true)}
                  />
                  <MiniMetric
                    label="Creator earnings"
                    value={formatUsd(product.creatorEarningsUsd, true)}
                  />
                  <MiniMetric
                    label="Available"
                    value={formatUsd(product.availableBalanceUsd, true)}
                  />
                </dl>
                <div className="mt-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!requireWallet("Share product")) return;
                      preview(`Share · ${product.name}`);
                    }}
                    className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
                  >
                    Share
                  </button>
                  <Link
                    href={product.href}
                    className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
                  >
                    View Product
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      if (!requireWallet("Claim Rewards")) return;
                      preview(
                        `Claim Rewards · ${product.name} · ${formatUsd(product.availableBalanceUsd, true)}`,
                      );
                    }}
                    className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
                  >
                    Claim Rewards
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!requireWallet("Feature Portfolio")) return;
                      if (!featuredPlacementsEnabled) {
                        preview("Feature Portfolio disabled by feature flag");
                        return;
                      }
                      setFeatureConfirmId(product.id);
                    }}
                    className="h-9 rounded-[10px] bg-app-brand px-3 text-[12px] font-bold text-white"
                  >
                    Feature Portfolio
                  </button>
                </div>
                {featureConfirmId === product.id ? (
                  <div className="space-y-2 rounded-[10px] border border-app-brand/30 bg-app-brand/5 p-3">
                    <p className="text-sm font-bold text-app-ink">
                      Feature confirmation
                    </p>
                    <ul className="space-y-1 text-xs text-app-muted">
                      <li>2,500 $DEXLA</li>
                      <li>Seven-day Featured placement</li>
                      <li>100% burned</li>
                      <li>Preview-only · feature-flagged</li>
                    </ul>
                    {featuredPlacementsEnabled ? (
                      <UtilityGateState
                        featureName="Feature Portfolio Placement"
                        demoMode={dexlaDemoMode}
                      />
                    ) : (
                      <p className="text-xs font-semibold text-app-warning">
                        FEATURED_PLACEMENTS_ENABLED is off.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          preview(
                            `Feature Portfolio · ${product.name} · 2,500 $DEXLA burned`,
                          );
                          setFeatureConfirmId(null);
                        }}
                        className="h-9 rounded-[10px] bg-app-brand px-3 text-[12px] font-bold text-white"
                      >
                        Confirm Feature (preview)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeatureConfirmId(null)}
                        className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 5. Audience */}
      <section className="app-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="app-display text-base font-semibold text-app-ink">
            Audience analytics · Illustrative
          </h2>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["followers", "Followers"],
                ["notify", "Notify"],
                ["likes", "Likes"],
                ["investors", "Investors"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAudienceTab(id)}
                className={[
                  "h-8 rounded-full px-3 text-[11px] font-bold",
                  audienceTab === id
                    ? "bg-app-brand text-white"
                    : "border border-app-line text-app-muted",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-40 rounded-[12px] border border-app-line bg-app-soft p-2">
          <MiniLineChart points={audienceSeries} height={144} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <h3 className="text-xs font-bold uppercase text-app-muted">
              Top regions
            </h3>
            <ul className="mt-1 space-y-1 text-sm text-app-ink">
              {workspace.audience.topRegions.map((r) => (
                <li key={r.region}>
                  {r.region} · {r.percent}%
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase text-app-muted">
              Acquisition source
            </h3>
            <ul className="mt-1 space-y-1 text-sm text-app-ink">
              {workspace.audience.acquisitionSources.map((s) => (
                <li key={s.source}>
                  {s.source} · {s.percent}%
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase text-app-muted">
              Investor mix
            </h3>
            <p className="mt-1 text-sm text-app-ink">
              New {workspace.audience.newInvestorsPercent}% · Returning{" "}
              {workspace.audience.returningInvestorsPercent}%
            </p>
          </div>
        </div>
      </section>

      {/* 6. Leaderboard position */}
      <section className="app-panel space-y-3 p-4 sm:p-5">
        <h2 className="app-display text-base font-semibold text-app-ink">
          Portfolio Leaderboard position
        </h2>
        <p className="text-[11px] text-app-muted">
          Each competing product ranks separately. Creators are never ranked as
          one combined portfolio.
        </p>
        {workspace.leaderboardRows.length === 0 ? (
          <EmptyState
            title="No competing products"
            description="Publish public products to appear on the Portfolio Leaderboard."
          />
        ) : (
          <ul className="space-y-3">
            {workspace.leaderboardRows.map((row) => (
              <li
                key={row.productId}
                className="rounded-[12px] border border-app-line bg-app-soft p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-app-ink">
                    {row.productName}{" "}
                    <span className="text-app-muted">· {row.kind}</span>
                  </p>
                  <p className="text-sm font-bold text-app-brand">
                    {row.rank ? `#${row.rank}` : "Unranked"} · {row.points} pts
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-app-muted">
                  Perf {row.performanceContribution}% · AUM {row.aumContribution}%
                  · Volume {row.volumeContribution}% · $DEXLA Tips{" "}
                  {row.tipsContribution}%
                </p>
                <p className="mt-1 text-[11px] text-app-muted">
                  Distance to Top 10:{" "}
                  {row.distanceToTop10 === 0
                    ? "Inside Top 10"
                    : `${row.distanceToTop10} places`}{" "}
                  · Monthly reset in {row.monthlyResetDays} days
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={APP_ROUTES.leaderboard}
          className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
        >
          View Full Portfolio Leaderboard
        </Link>
      </section>

      {/* 7. My Strategies */}
      <section className="app-panel space-y-3 p-4 sm:p-5">
        <h2 className="app-display text-base font-semibold text-app-ink">
          My Strategies
        </h2>
        <p className="text-[11px] text-app-muted">
          Applicable execution-fee share: {workspace.executionFeeSharePercent}%
        </p>
        {workspace.strategies.length === 0 ? (
          <EmptyState
            title="No published strategies"
            description="Publish a strategy to track creator users, sales and $DEXLA revenue."
          />
        ) : (
          <ul className="space-y-3">
            {workspace.strategies.map((s) => (
              <li
                key={s.id}
                className="rounded-[12px] border border-app-line bg-app-soft p-3"
              >
                <p className="text-sm font-bold text-app-ink">{s.name}</p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  <MiniMetric
                    label="Active users"
                    value={String(s.activeCreatorUsers)}
                  />
                  <MiniMetric
                    label="Access price"
                    value={
                      s.accessPriceDexla == null
                        ? "Free"
                        : formatDexla(s.accessPriceDexla)
                    }
                  />
                  <MiniMetric label="Sales" value={String(s.accessSales)} />
                  <MiniMetric
                    label="Revenue"
                    value={formatDexla(s.creatorRevenueDexla)}
                  />
                  <MiniMetric
                    label="Burned $DEXLA"
                    value={formatDexla(s.burnedDexla)}
                  />
                  <MiniMetric
                    label="AUM influenced"
                    value={formatUsd(s.influencedAumUsd, true)}
                  />
                  <MiniMetric
                    label="Volume influenced"
                    value={formatUsd(s.influencedVolumeUsd, true)}
                  />
                </dl>
                <button
                  type="button"
                  onClick={() => {
                    if (!requireWallet("Claim Revenue")) return;
                    preview(`Claim Revenue · ${s.name}`);
                  }}
                  className="mt-2 h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
                >
                  Claim Revenue
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${APP_ROUTES.strategies}?tab=mine`}
            className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
          >
            View My Strategies
          </Link>
          <Link
            href={`${APP_ROUTES.strategies}?tab=publish`}
            className="inline-flex h-9 items-center rounded-[10px] bg-app-brand px-3 text-[12px] font-bold text-white"
          >
            Publish New Strategy
          </Link>
        </div>
      </section>

      {/* 8. Activity */}
      <section className="app-panel space-y-3 p-4 sm:p-5">
        <h2 className="app-display text-base font-semibold text-app-ink">
          Recent activity · Illustrative
        </h2>
        {workspace.activity.length === 0 ? (
          <EmptyState
            title="No recent activity"
            description="Investments, tips, strategy access and rewards will appear here."
          />
        ) : (
          <ul className="space-y-2">
            {workspace.activity.map((item) => (
              <li
                key={item.id}
                className="rounded-[10px] border border-app-line bg-app-soft px-3 py-2"
              >
                <p className="text-sm font-semibold text-app-ink">{item.title}</p>
                <p className="text-[11px] text-app-muted">
                  {item.subtitle} · {formatRelativeTime(item.atIso)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => preview("View Full History")}
          className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
        >
          View Full History
        </button>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-panel px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-app-ink">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-app-muted">{label}</dt>
      <dd className="font-bold text-app-ink">{value}</dd>
    </div>
  );
}
