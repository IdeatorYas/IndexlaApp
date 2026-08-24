"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MarketplaceCategory } from "@/lib/domain/dashboard";
import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardProductKind,
  LeaderboardWorkspace,
} from "@/lib/domain/leaderboard";
import type { NetworkId } from "@/lib/domain/types";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import {
  ProductAttribution,
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
  formatUsd,
} from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";

type ViewState = "loading" | "ready" | "error" | "empty";

function countdownLabel(resetAtIso: string, nowMs: number): string {
  const ms = new Date(resetAtIso).getTime() - nowMs;
  if (ms <= 0) return "Resets soon";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${mins}m`;
}

export function LeaderboardView({
  workspace,
  illustrative,
  initialError = false,
}: {
  workspace: LeaderboardWorkspace;
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketplaceCategory | "All">("All");
  const [network, setNetwork] = useState<NetworkId | "All">("All");
  const [productKind, setProductKind] = useState<
    LeaderboardProductKind | "All"
  >("All");
  const [message, setMessage] = useState<string | null>(null);
  const [staleOverride, setStaleOverride] = useState(workspace.marketDataStale);
  const [rewardDetailsId, setRewardDetailsId] = useState<string | null>(null);

  const period =
    (searchParams.get("period") as LeaderboardPeriod | null) ?? "monthly";
  const isMonthly = period === "monthly";

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => {
      const entries =
        period === "monthly"
          ? workspace.monthlyEntries
          : workspace.allTimeEntries;
      setViewState(entries.length === 0 ? "empty" : "ready");
    }, 280);
    return () => window.clearTimeout(timer);
  }, [
    initialError,
    period,
    workspace.monthlyEntries,
    workspace.allTimeEntries,
  ]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  function syncPeriod(next: LeaderboardPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "monthly") params.delete("period");
    else params.set("period", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function preview(action: string) {
    setMessage(
      `${action} — preview only. No real claim, payment or transaction was submitted.`,
    );
  }

  const sourceEntries = isMonthly
    ? workspace.monthlyEntries
    : workspace.allTimeEntries;

  const filtered = useMemo(() => {
    let list = [...sourceEntries];
    if (category !== "All") list = list.filter((e) => e.category === category);
    if (productKind !== "All") list = list.filter((e) => e.kind === productKind);
    if (network !== "All") {
      list = list.filter((e) => e.networkIds.includes(network));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.creatorName.toLowerCase().includes(q) ||
          e.creatorHandle.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [sourceEntries, category, productKind, network, query]);

  const podium = filtered.filter((e) => e.rank <= 3).slice(0, 3);
  const winners = filtered.filter((e) => e.rank >= 1 && e.rank <= 10);
  const competing = filtered.filter((e) => e.rank >= 11 && e.rank <= 25);

  const w = workspace.rankingWeights;

  if (viewState === "loading") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <LoadingSkeleton title="Loading Portfolio Leaderboard" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <ErrorState
          title="Leaderboard unavailable"
          description="Unable to load Portfolio Leaderboard rankings."
          action={
            <button
              type="button"
              className="app-gradient-btn rounded-[10px] px-4 py-2 text-sm font-bold"
              onClick={() =>
                setViewState(sourceEntries.length === 0 ? "empty" : "ready")
              }
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  if (viewState === "empty") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <EmptyState
          title="No competing portfolios"
          description="When public portfolios and indexes publish, they will appear here ranked separately by product."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-5" style={{ maxWidth: "var(--content-max)" }}>
      <Header illustrative={illustrative} />

      {wallet.state !== "connected" ? (
        <div className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">Wallet disconnected</p>
            <p className="mt-0.5 text-xs text-app-muted">
              Browse rankings freely. Connect to preview Claim Rewards when
              eligible.
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

      {staleOverride || workspace.marketDataStale ? (
        <div
          className="rounded-[10px] border border-app-warning/40 bg-app-warning/10 px-3 py-2 text-xs text-app-ink"
          role="status"
        >
          Market data may be stale — ranking figures remain illustrative.
          <button
            type="button"
            className="ml-2 font-bold underline"
            onClick={() => setStaleOverride(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="app-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div
              className="inline-flex gap-1 rounded-full border border-app-line bg-app-soft p-1"
              role="tablist"
              aria-label="Leaderboard period"
            >
              <PeriodTab
                label="Monthly"
                selected={isMonthly}
                onClick={() => syncPeriod("monthly")}
              />
              <PeriodTab
                label="All-Time"
                selected={!isMonthly}
                onClick={() => syncPeriod("all-time")}
              />
            </div>
            {!isMonthly ? (
              <p className="text-[11px] font-semibold text-app-muted">
                All-Time is historical only — it does not create reward
                eligibility.
              </p>
            ) : null}
          </div>

          {isMonthly ? (
            <div className="flex flex-wrap gap-3 text-right">
              <StatChip
                label="Monthly reset"
                value={countdownLabel(workspace.resetAtIso, nowMs)}
              />
              <StatChip
                label="Creator Rewards Pool"
                value={formatUsd(workspace.rewardsPoolUsd, true)}
              />
            </div>
          ) : (
            <StatChip label="Historical view" value="No rewards" />
          )}
        </div>

        <div className="space-y-1.5 text-sm text-app-muted">
          <p>
            A portion of platform fees funds the monthly Creator Rewards Pool.
          </p>
          <p className="font-semibold text-app-ink">
            Performance {w.performance}% · AUM {w.aum}% · Volume {w.volume}% ·
            $DEXLA Tips {w.tips}%
          </p>
          <p>The Top 10 portfolios qualify each month.</p>
          <p className="text-[11px]">
            Likes and follows are engagement metrics only and never affect
            ranking.
          </p>
        </div>
      </section>

      {message ? (
        <p className="rounded-[10px] border border-app-line bg-app-soft px-3 py-2 text-xs text-app-muted">
          {message}
        </p>
      ) : null}

      <Filters
        query={query}
        setQuery={setQuery}
        category={category}
        setCategory={setCategory}
        network={network}
        setNetwork={setNetwork}
        productKind={productKind}
        setProductKind={setProductKind}
        categories={workspace.categories}
        networks={workspace.networks}
        productKinds={workspace.productKinds}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching portfolios"
          description="Adjust category, chain, product type or search to see rankings."
        />
      ) : (
        <>
          <Podium entries={podium} isMonthly={isMonthly} />

          <RankingTable
            title="Winner Zone"
            subtitle={
              isMonthly
                ? "Ranks 1–10 · monthly reward winners"
                : "Ranks 1–10 · historical leaders (no rewards)"
            }
            entries={winners}
            highlight
            isMonthly={isMonthly}
          />

          <RankingTable
            title="Competing Portfolios"
            subtitle="Ranks 11–25 · outside the current Winner Zone"
            entries={competing}
            highlight={false}
            isMonthly={isMonthly}
          />
        </>
      )}

      {isMonthly ? (
        <RewardsSection
          workspace={workspace}
          walletConnected={wallet.state === "connected"}
          rewardDetailsId={rewardDetailsId}
          setRewardDetailsId={setRewardDetailsId}
          onPreview={preview}
          onConnect={connectDemo}
        />
      ) : (
        <section className="app-panel p-4 sm:p-5">
          <h2 className="app-display text-base font-semibold text-app-ink">
            Rewards
          </h2>
          <p className="mt-2 text-sm text-app-muted">
            Monthly is the primary rewards period. All-Time does not imply
            All-Time rewards or claim eligibility.
          </p>
        </section>
      )}
    </div>
  );
}

function Header({ illustrative }: { illustrative: boolean }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="app-display text-2xl font-bold tracking-tight text-app-ink sm:text-[1.75rem]">
          Portfolio Leaderboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-app-muted">
          Ranks individual portfolios and indexes — not creators. Each product
          competes separately. Separate from the Creator Leaderboard.
        </p>
        <Link
          href={APP_ROUTES.creatorLeaderboard}
          className="mt-2 inline-flex text-xs font-bold text-app-brand hover:underline"
        >
          View Creator Leaderboard →
        </Link>
      </div>
      {illustrative ? <IllustrativeBadge /> : null}
    </header>
  );
}

function PeriodTab({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={[
        "app-page-tab app-interactive",
        selected ? "app-page-tab-active" : "text-app-ink/70",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[7.5rem]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">
        {label}
      </p>
      <p className="text-sm font-bold text-app-ink">{value}</p>
    </div>
  );
}

function Filters({
  query,
  setQuery,
  category,
  setCategory,
  network,
  setNetwork,
  productKind,
  setProductKind,
  categories,
  networks,
  productKinds,
}: {
  query: string;
  setQuery: (v: string) => void;
  category: MarketplaceCategory | "All";
  setCategory: (v: MarketplaceCategory | "All") => void;
  network: NetworkId | "All";
  setNetwork: (v: NetworkId | "All") => void;
  productKind: LeaderboardProductKind | "All";
  setProductKind: (v: LeaderboardProductKind | "All") => void;
  categories: MarketplaceCategory[];
  networks: { id: NetworkId; label: string }[];
  productKinds: LeaderboardProductKind[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search portfolio, index or creator"
        aria-label="Search leaderboard"
        className="h-9 min-w-[12rem] flex-1 rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm text-app-ink"
      />
      <select
        aria-label="Category"
        value={category}
        onChange={(e) =>
          setCategory(e.target.value as MarketplaceCategory | "All")
        }
        className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-2 text-xs font-semibold text-app-ink"
      >
        <option value="All">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        aria-label="Chain"
        value={network}
        onChange={(e) => setNetwork(e.target.value as NetworkId | "All")}
        className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-2 text-xs font-semibold text-app-ink"
      >
        <option value="All">All chains</option>
        {networks.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Product type"
        value={productKind}
        onChange={(e) =>
          setProductKind(e.target.value as LeaderboardProductKind | "All")
        }
        className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-2 text-xs font-semibold text-app-ink"
      >
        <option value="All">All types</option>
        {productKinds.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}

function Podium({
  entries,
  isMonthly,
}: {
  entries: LeaderboardEntry[];
  isMonthly: boolean;
}) {
  const ordered = [entries.find((e) => e.rank === 2), entries.find((e) => e.rank === 1), entries.find((e) => e.rank === 3)].filter(
    Boolean,
  ) as LeaderboardEntry[];

  if (ordered.length === 0) return null;

  return (
    <section aria-label="Top 3 podium">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="app-display text-base font-semibold text-app-ink">
          Top 3
        </h2>
        {isMonthly ? (
          <span className="rounded-full bg-[color:var(--color-accent-emerald)]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[color:var(--color-accent-emerald)]">
            Win Monthly Rewards
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {ordered.map((entry) => (
          <PodiumCard key={entry.portfolioId} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function PodiumCard({ entry }: { entry: LeaderboardEntry }) {
  const height =
    entry.rank === 1 ? "md:pt-2" : entry.rank === 2 ? "md:pt-6" : "md:pt-10";
  const rankTone =
    entry.rank === 1
      ? "border-[color:var(--color-accent-amber)]/50 bg-[color:var(--color-accent-amber)]/10"
      : entry.rank === 2
        ? "border-app-line bg-app-elevated"
        : "border-app-line/80 bg-app-soft";

  return (
    <article
      className={[
        "app-panel flex flex-col gap-3 border p-4",
        rankTone,
        height,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">
            Rank #{entry.rank}
          </p>
          <h3 className="mt-0.5 text-sm font-bold text-app-ink">{entry.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <ProductTypeBadge kind={entry.kind} />
            {entry.isIndexlaProduct ? (
              <span className="rounded-md bg-app-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-brand">
                INDEXLA
              </span>
            ) : (
              <span className="rounded-md bg-app-panel px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-muted">
                Creator
              </span>
            )}
          </div>
          <ProductAttribution
            creatorName={entry.creatorName}
            creatorHandle={entry.creatorHandle}
            verified={entry.verified}
            className="mt-1 truncate text-[11px] font-semibold text-app-muted"
          />
        </div>
        <AllocationDonut
          segments={entry.allocations.map((a) => ({
            label: a.label,
            percent: a.percent,
            assetId: a.assetId,
          }))}
          size={52}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <Metric label="Points" value={entry.points.toLocaleString()} />
        <Metric
          label="Performance"
          value={formatPercent(entry.performancePercent, true)}
        />
        <Metric label="AUM" value={formatUsd(entry.aumUsd, true)} />
        <Metric label="Volume" value={formatUsd(entry.volumeUsd, true)} />
        <Metric label="Investors" value={entry.investors.toLocaleString()} />
        <Metric label="$DEXLA Tips" value={formatDexla(entry.tipsDexla)} />
      </dl>

      <p className="text-[10px] text-app-muted">
        Allocation:{" "}
        {entry.allocations.map((a) => `${a.label} ${a.percent}%`).join(" · ")}
      </p>

      <Link
        href={entry.href}
        className="mt-auto inline-flex h-9 items-center justify-center app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
      >
        View Product
      </Link>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-app-muted">{label}</dt>
      <dd className="font-bold text-app-ink">{value}</dd>
    </div>
  );
}

function RankingTable({
  title,
  subtitle,
  entries,
  highlight,
  isMonthly,
}: {
  title: string;
  subtitle: string;
  entries: LeaderboardEntry[];
  highlight: boolean;
  isMonthly: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <section
      className={[
        "app-panel overflow-hidden",
        highlight
          ? "border-[color:var(--color-accent-emerald)]/35 ring-1 ring-[color:var(--color-accent-emerald)]/20"
          : "opacity-95",
      ].join(" ")}
      aria-label={title}
    >
      <div
        className={[
          "flex flex-wrap items-center justify-between gap-2 border-b border-app-line px-4 py-3",
          highlight ? "bg-[color:var(--color-accent-emerald)]/8" : "bg-app-soft",
        ].join(" ")}
      >
        <div>
          <h2 className="app-display text-base font-semibold text-app-ink">
            {title}
          </h2>
          <p className="text-[11px] text-app-muted">{subtitle}</p>
        </div>
        {highlight && isMonthly ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--color-accent-emerald)]">
            Monthly reward winners
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-b border-app-line text-[10px] uppercase tracking-wide text-app-muted">
              <th className="px-3 py-2 font-bold">Rank</th>
              <th className="px-3 py-2 font-bold">Portfolio/Index</th>
              <th className="px-3 py-2 font-bold">Creator</th>
              <th className="px-3 py-2 font-bold">Points</th>
              <th className="px-3 py-2 font-bold">Performance</th>
              <th className="px-3 py-2 font-bold">AUM</th>
              <th className="px-3 py-2 font-bold">Volume</th>
              <th className="px-3 py-2 font-bold">Investors</th>
              <th className="px-3 py-2 font-bold">$DEXLA Tips</th>
              <th className="px-3 py-2 font-bold">Growth</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.portfolioId}
                className={[
                  "border-b border-app-line/70 last:border-0",
                  highlight ? "bg-[color:var(--color-accent-emerald)]/[0.03]" : "",
                ].join(" ")}
              >
                <td className="px-3 py-2.5 font-bold text-app-ink">
                  #{entry.rank}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href={entry.href}
                      className="font-bold text-app-ink hover:underline"
                    >
                      {entry.name}
                    </Link>
                    <div className="flex flex-wrap gap-1">
                      <ProductTypeBadge kind={entry.kind} />
                      <span className="text-[10px] text-app-muted">
                        {entry.category}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <ProductAttribution
                    creatorName={entry.creatorName}
                    creatorHandle={entry.creatorHandle}
                    verified={entry.verified}
                    className="text-[11px] font-semibold text-app-muted"
                  />
                </td>
                <td className="px-3 py-2.5 font-semibold text-app-ink">
                  {entry.points.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 font-semibold text-app-ink">
                  {formatPercent(entry.performancePercent, true)}
                </td>
                <td className="px-3 py-2.5">{formatUsd(entry.aumUsd, true)}</td>
                <td className="px-3 py-2.5">
                  {formatUsd(entry.volumeUsd, true)}
                </td>
                <td className="px-3 py-2.5">{entry.investors.toLocaleString()}</td>
                <td className="px-3 py-2.5">{formatDexla(entry.tipsDexla)}</td>
                <td className="px-3 py-2.5 font-semibold text-app-ink">
                  {formatPercent(entry.growthPercent, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RewardsSection({
  workspace,
  walletConnected,
  rewardDetailsId,
  setRewardDetailsId,
  onPreview,
  onConnect,
}: {
  workspace: LeaderboardWorkspace;
  walletConnected: boolean;
  rewardDetailsId: string | null;
  setRewardDetailsId: (id: string | null) => void;
  onPreview: (action: string) => void;
  onConnect: () => void;
}) {
  const r = workspace.rewards;
  const selected =
    r.monthlyBreakdowns.find((b) => b.portfolioId === rewardDetailsId) ??
    r.monthlyBreakdowns[0] ??
    null;

  return (
    <section className="app-panel space-y-4 p-4 sm:p-5" aria-label="Monthly rewards">
      <div>
        <h2 className="app-display text-base font-semibold text-app-ink">
          Monthly Creator Rewards
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          Rewards purchase the underlying assets of each winning portfolio.
          Split: {r.creatorSharePercent}% to the creator and{" "}
          {r.investorSharePercent}% to eligible investors.
        </p>
      </div>

      <ul className="grid gap-2 text-sm text-app-muted sm:grid-cols-2">
        <li>
          Investor eligibility requires investment in the winning portfolio, a
          $DEXLA tip, and a minimum {r.minHoldingDays}-day holding period.
        </li>
        <li>
          Investor allocation weighting: {r.investorWeightInvestedPercent}%
          amount invested · {r.investorWeightTippedPercent}% amount tipped.
        </li>
        <li>Creators cannot receive the investor-side allocation.</li>
        <li>
          Likes and follows are engagement metrics only and never affect ranking.
        </li>
      </ul>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <RewardStat
          label="Est. reward / winner"
          value={formatUsd(r.estimatedRewardPerWinnerUsd, true)}
        />
        <RewardStat
          label="Creator share"
          value={`${r.creatorSharePercent}%`}
        />
        <RewardStat
          label="Investor pool"
          value={`${r.investorSharePercent}%`}
        />
        <RewardStat
          label="Pool total"
          value={formatUsd(workspace.rewardsPoolUsd, true)}
        />
      </div>

      {selected ? (
        <div className="rounded-[12px] border border-app-line bg-app-soft p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">
                Reward details
              </p>
              <p className="text-sm font-bold text-app-ink">
                {selected.portfolioName}
              </p>
            </div>
            <select
              aria-label="Select winning portfolio"
              value={selected.portfolioId}
              onChange={(e) => setRewardDetailsId(e.target.value)}
              className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-2 text-xs font-semibold text-app-ink"
            >
              {r.monthlyBreakdowns.map((b) => (
                <option key={b.portfolioId} value={b.portfolioId}>
                  {b.portfolioName}
                </option>
              ))}
            </select>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Metric
              label="Estimated reward"
              value={formatUsd(selected.estimatedRewardUsd)}
            />
            <Metric
              label="Creator share"
              value={formatUsd(selected.creatorShareUsd)}
            />
            <Metric
              label="Investor pool"
              value={formatUsd(selected.investorPoolUsd)}
            />
            <Metric
              label="Eligible investors"
              value={selected.eligibleInvestorCount.toLocaleString()}
            />
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-3 text-[12px] font-bold text-app-ink"
              onClick={() =>
                onPreview(`View Reward Details · ${selected.portfolioName}`)
              }
            >
              View Reward Details
            </button>
            {selected.claimEligible ? (
              walletConnected ? (
                <button
                  type="button"
                  className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
                  onClick={() =>
                    onPreview(
                      `Claim Rewards · ${formatUsd(selected.claimableUsd ?? 0)}`,
                    )
                  }
                >
                  Claim Rewards · {formatUsd(selected.claimableUsd ?? 0)}
                </button>
              ) : (
                <button
                  type="button"
                  className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
                  onClick={onConnect}
                >
                  Connect to claim preview
                </button>
              )
            ) : (
              <span className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-[11px] font-semibold text-app-muted">
                Claim not applicable for this demo profile
              </span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RewardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-app-line bg-app-elevated px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-app-ink">{value}</p>
    </div>
  );
}
