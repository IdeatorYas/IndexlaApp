"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CreatorPublicProfile } from "@/lib/domain/creators";
import { CREATOR_FUNDS_DISCLOSURE } from "@/lib/domain/creators";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import {
  ProductTypeBadge,
} from "@/components/product/ProductIdentity";
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
} from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";

type ViewState = "loading" | "ready" | "error";

export function CreatorProfileView({
  profile,
  illustrative,
  initialError = false,
}: {
  profile: CreatorPublicProfile;
  illustrative: boolean;
  initialError?: boolean;
}) {
  const { wallet, connectDemo } = useDemoWallet();
  const [viewState, setViewState] = useState<ViewState>(
    initialError ? "error" : "loading",
  );
  const [following, setFollowing] = useState(profile.initiallyFollowing);
  const [notify, setNotify] = useState(profile.initiallyNotify);
  const [likedProducts, setLikedProducts] = useState<Record<string, boolean>>(
    {},
  );
  const [productNotify, setProductNotify] = useState<Record<string, boolean>>(
    {},
  );
  const [tipOpen, setTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState("50");
  const [message, setMessage] = useState<string | null>(null);
  const [staleOverride, setStaleOverride] = useState(profile.marketDataStale);
  const [chartTab, setChartTab] = useState<"performance" | "aum" | "investors">(
    "performance",
  );

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => setViewState("ready"), 280);
    return () => window.clearTimeout(timer);
  }, [initialError, profile.handle]);

  function preview(action: string) {
    setMessage(
      `${action} — preview only. No real follow, notification, tip, invest or transaction was submitted.`,
    );
  }

  function requireWallet(action: string): boolean {
    if (wallet.state === "connected") return true;
    connectDemo();
    preview(action);
    return false;
  }

  if (viewState === "loading") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <LoadingSkeleton title="Loading creator profile" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <ErrorState
          title="Creator profile unavailable"
          description="Unable to load this creator profile."
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

  const chartSeries =
    chartTab === "performance"
      ? profile.performanceSeries
      : chartTab === "aum"
        ? profile.aumSeries
        : profile.investorSeries;

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
              Browse this profile freely. Connect for Follow, Notify, Tip and
              Invest previews.
            </p>
          </div>
          <button
            type="button"
            onClick={connectDemo}
            className="h-9 app-gradient-btn rounded-[10px] px-4 text-[12px] font-bold text-white"
          >
            Connect Wallet
          </button>
        </div>
      ) : null}

      {staleOverride || profile.marketDataStale ? (
        <div
          className="rounded-[10px] border border-app-warning/40 bg-app-warning/10 px-3 py-2 text-xs text-app-ink"
          role="status"
        >
          Market data may be stale — AUM, performance, volume and activity remain
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

      <section className="app-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <CreatorAvatar
            initials={profile.avatarInitials}
            hue={profile.avatarHue}
            size={72}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="app-display text-2xl font-bold text-app-ink">
                {profile.displayName}
              </h1>
              {profile.verified ? (
                <span className="rounded-md bg-app-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-brand">
                  Verified
                </span>
              ) : null}
            </div>
            <p className="text-sm font-semibold text-app-muted">
              @{profile.handle} · {profile.specialty} · Creator since{" "}
              {new Date(profile.creatorSince).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </p>
            <p className="max-w-2xl text-sm text-app-muted">{profile.bio}</p>
            <div className="flex flex-wrap gap-2">
              {profile.socials.map((s) => (
                <a
                  key={`${s.platform}-${s.url}`}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[10px] border border-app-line bg-app-elevated px-2.5 py-1 text-[11px] font-bold text-app-ink hover:border-app-brand/40"
                >
                  {s.platform}: {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (!requireWallet("Follow")) return;
              setFollowing((v) => {
                const next = !v;
                preview(
                  next
                    ? `Following @${profile.handle}`
                    : `Unfollowed @${profile.handle}`,
                );
                return next;
              });
            }}
            className={[
              "h-9 rounded-[10px] px-3 text-[12px] font-bold",
              following
                ? "border border-app-brand/40 bg-app-brand/10 text-app-brand"
                : "bg-app-brand text-white",
            ].join(" ")}
          >
            {following ? "Following" : "Follow"}
          </button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-app-line bg-app-elevated px-3 text-[11px] font-semibold text-app-ink">
            <input
              type="checkbox"
              checked={notify}
              onChange={() => {
                if (!requireWallet("Notify")) return;
                if (!following) {
                  preview("Follow first to enable new-portfolio notifications");
                  return;
                }
                setNotify((v) => {
                  const next = !v;
                  preview(
                    next
                      ? `Notify on for @${profile.handle}`
                      : `Notify off for @${profile.handle}`,
                  );
                  return next;
                });
              }}
            />
            Notify Me About New Portfolios
          </label>
          <button
            type="button"
            onClick={() => {
              if (!requireWallet("Tip")) return;
              setTipOpen(true);
            }}
            className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-3 text-[12px] font-bold text-app-ink"
          >
            Tip $DEXLA
          </button>
          <button
            type="button"
            onClick={() => {
              const url =
                typeof window !== "undefined"
                  ? window.location.href
                  : APP_ROUTES.creatorProfile(profile.handle);
              void navigator.clipboard?.writeText(url);
              preview(`Share Profile · ${url}`);
            }}
            className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-3 text-[12px] font-bold text-app-ink"
          >
            Share Profile
          </button>
        </div>
        <p className="text-[11px] text-app-muted">
          Likes and follows are engagement metrics only and never affect
          Portfolio Leaderboard ranking.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Followers" value={profile.followerCount.toLocaleString()} />
        <MetricCard
          label="Notify subscribers"
          value={profile.notificationSubscriberCount.toLocaleString()}
        />
        <MetricCard label="Total AUM" value={formatUsd(profile.totalAumUsd, true)} />
        <MetricCard
          label="Total volume"
          value={formatUsd(profile.totalVolumeUsd, true)}
        />
        <MetricCard
          label="Investors/copiers"
          value={profile.investorsCopiers.toLocaleString()}
        />
        <MetricCard
          label="Live public products"
          value={String(profile.liveProductCount)}
        />
        <MetricCard
          label="Best Portfolio LB rank"
          value={
            profile.bestPortfolioLeaderboardRank
              ? `#${profile.bestPortfolioLeaderboardRank}`
              : "—"
          }
        />
        <MetricCard
          label="Best performance"
          value={formatPercent(profile.bestPerformancePercent, true)}
        />
        <MetricCard label="Likes" value={profile.totalLikes.toLocaleString()} />
        <MetricCard
          label="Growth"
          value={formatPercent(profile.growthPercent, true)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="app-display text-base font-semibold text-app-ink">
          Public products
        </h2>
        <p className="text-[11px] text-app-muted">
          Each published portfolio/index competes separately on the Portfolio
          Leaderboard.
        </p>
        {profile.products.length === 0 ? (
          <EmptyState
            title="No public products"
            description="This creator has not published public portfolios or indexes yet."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {profile.products.map((product) => {
              const liked = Boolean(likedProducts[product.id]);
              return (
                <article key={product.id} className="app-panel flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ProductTypeBadge kind={product.kind} />
                        {product.verified ? (
                          <span className="rounded-md bg-app-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-brand">
                            Verified
                          </span>
                        ) : null}
                        <span className="rounded-md bg-app-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-warning">
                          Illustrative
                        </span>
                        <span className="rounded-md bg-app-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-muted">
                          Risk: {product.risk}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-bold text-app-ink">
                        {product.name}
                      </h3>
                      <p className="text-[11px] text-app-muted">
                        {product.strategy}
                        {product.portfolioLeaderboardRank
                          ? ` · Portfolio LB #${product.portfolioLeaderboardRank}`
                          : ""}
                      </p>
                    </div>
                    <AllocationDonut
                      segments={product.allocations.map((a) => ({
                        label: a.label,
                        percent: a.percent,
                        assetId: a.assetId,
                      }))}
                      size={48}
                    />
                  </div>
                  <p className="line-clamp-2 text-[11px] text-app-muted">
                    {product.allocations
                      .map((a) => `${a.label} ${a.percent}%`)
                      .join(" · ")}
                  </p>
                  <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                    <MiniMetric
                      label="Performance"
                      value={formatPercent(product.performance30d, true)}
                    />
                    <MiniMetric label="AUM" value={formatUsd(product.aumUsd, true)} />
                    <MiniMetric
                      label="Volume"
                      value={formatUsd(product.volumeUsd, true)}
                    />
                    <MiniMetric
                      label="Investors"
                      value={product.investors.toLocaleString()}
                    />
                  </dl>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!requireWallet("Like")) return;
                        setLikedProducts((prev) => {
                          const next = !prev[product.id];
                          preview(
                            next
                              ? `Liked ${product.name} — engagement only`
                              : `Unliked ${product.name}`,
                          );
                          return { ...prev, [product.id]: next };
                        });
                      }}
                      className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-3 text-[12px] font-bold text-app-ink"
                    >
                      {liked ? "Liked" : "Like"} ·{" "}
                      {product.likes + (liked ? 1 : 0)}
                    </button>
                    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-app-line px-3 text-[11px] font-semibold text-app-ink">
                      <input
                        type="checkbox"
                        checked={Boolean(productNotify[product.id])}
                        onChange={() => {
                          if (!requireWallet("Follow product updates")) return;
                          setProductNotify((prev) => {
                            const next = !prev[product.id];
                            preview(
                              next
                                ? `Follow updates · ${product.name}`
                                : `Unfollow updates · ${product.name}`,
                            );
                            return { ...prev, [product.id]: next };
                          });
                        }}
                      />
                      Follow product updates
                    </label>
                    <Link
                      href={product.href}
                      className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
                    >
                      View Product
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (!requireWallet("Invest")) return;
                        preview(`Invest preview · ${product.name}`);
                      }}
                      className="app-btn-invest h-9 rounded-[10px] px-3 text-[12px]"
                    >
                      Invest
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="app-display text-base font-semibold text-app-ink">
          Published strategies
        </h2>
        <p className="text-[11px] text-app-muted">
          Investors access strategies through portfolios. Paid copying/reuse
          remains creator-to-creator on Strategies.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {profile.strategies.map((strategy) => (
            <article key={strategy.id} className="app-panel space-y-2 p-4">
              <h3 className="text-sm font-bold text-app-ink">{strategy.name}</h3>
              <p className="text-xs text-app-muted">{strategy.logicSummary}</p>
              <dl className="grid grid-cols-2 gap-2 text-[11px]">
                <MiniMetric label="Risk" value={strategy.riskLevel} />
                <MiniMetric
                  label="Performance"
                  value={formatPercent(strategy.performance30d, true)}
                />
                <MiniMetric
                  label="Active portfolios"
                  value={String(strategy.activePortfolios)}
                />
                <MiniMetric
                  label="Access"
                  value={
                    strategy.accessPriceDexla == null
                      ? "Free"
                      : formatDexla(strategy.accessPriceDexla)
                  }
                />
              </dl>
              <p className="text-[11px] text-app-muted">
                Assets: {strategy.compatibleAssets.join(", ")} · Networks:{" "}
                {strategy.networkIds.join(", ")}
              </p>
              <Link
                href={strategy.href}
                className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
              >
                View Strategy
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="app-panel space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="app-display text-base font-semibold text-app-ink">
            Analytics · Illustrative
          </h2>
          <div className="flex gap-1">
            {(
              [
                ["performance", "Performance"],
                ["aum", "AUM growth"],
                ["investors", "Investor growth"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartTab(id)}
                className={[
                  "h-8 rounded-full px-3 text-[11px] font-bold",
                  chartTab === id
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
          <MiniLineChart points={chartSeries} height={144} />
        </div>
      </section>

      <section className="app-panel space-y-3 p-4 sm:p-5">
        <h2 className="app-display text-base font-semibold text-app-ink">
          Activity / history · Illustrative
        </h2>
        <ul className="space-y-2">
          {profile.activity.map((item) => (
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
      </section>

      <section className="app-panel space-y-3 border-app-danger/20 p-4 sm:p-5">
        <h2 className="app-display text-base font-semibold text-app-ink">
          Disclosure and risk
        </h2>
        <p
          data-testid="creator-funds-disclosure"
          className="text-sm font-semibold text-app-ink"
        >
          {CREATOR_FUNDS_DISCLOSURE}
        </p>
        <ul className="space-y-1.5 text-sm text-app-muted">
          {profile.disclosures
            .filter(
              (d) =>
                !d
                  .toLowerCase()
                  .includes("creators never control investor funds"),
            )
            .map((d) => (
              <li key={d} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-app-brand" />
                <span>{d}</span>
              </li>
            ))}
        </ul>
      </section>

      {tipOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tip-title"
        >
          <div className="w-full max-w-md space-y-4 rounded-[14px] border border-app-line bg-app-elevated p-5 shadow-xl">
            <h3 id="tip-title" className="app-display text-lg font-bold text-app-ink">
              Tip $DEXLA
            </h3>
            <p className="text-sm text-app-muted">
              Preview tip to @{profile.handle}. No real $DEXLA transfer.
            </p>
            <label className="block text-xs font-bold text-app-muted">
              Amount ($DEXLA)
              <input
                type="number"
                min={1}
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-soft px-3 text-sm text-app-ink"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTipOpen(false)}
                className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipOpen(false);
                  preview(
                    `Tip ${Number(tipAmount).toLocaleString()} $DEXLA → @${profile.handle}`,
                  );
                }}
                className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
              >
                Confirm Tip Preview
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
      <dd className="font-bold capitalize text-app-ink">{value}</dd>
    </div>
  );
}
