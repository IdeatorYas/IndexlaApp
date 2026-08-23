"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CreatorDirectoryEntry,
  CreatorSpecialty,
  CreatorsWorkspace,
} from "@/lib/domain/creators";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";

type ViewState = "loading" | "ready" | "error" | "empty";

export function CreatorLeaderboardView({
  workspace,
  illustrative,
  initialError = false,
}: {
  workspace: CreatorsWorkspace;
  illustrative: boolean;
  initialError?: boolean;
}) {
  const { wallet, connectDemo } = useDemoWallet();
  const [viewState, setViewState] = useState<ViewState>(
    initialError ? "error" : "loading",
  );
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState<CreatorSpecialty | "All">("All");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => {
      setViewState(workspace.creators.length === 0 ? "empty" : "ready");
    }, 280);
    return () => window.clearTimeout(timer);
  }, [initialError, workspace.creators.length]);

  const ranked = useMemo(() => {
    let list = [...workspace.creators].sort(
      (a, b) => a.discoveryRank - b.discoveryRank,
    );
    if (specialty !== "All") {
      list = list.filter((c) => c.specialty === specialty);
    }
    if (verifiedOnly) list = list.filter((c) => c.verified);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.handle.toLowerCase().includes(q),
      );
    }
    return list;
  }, [workspace.creators, specialty, verifiedOnly, query]);

  const podium = [2, 1, 3]
    .map((rank) => ranked.find((c) => c.discoveryRank === rank))
    .filter(Boolean) as CreatorDirectoryEntry[];

  if (viewState === "loading") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <LoadingSkeleton title="Loading Creator Leaderboard" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <ErrorState
          title="Creator Leaderboard unavailable"
          description="Unable to load creator discovery rankings."
          action={
            <button
              type="button"
              className="app-gradient-btn rounded-[10px] px-4 py-2 text-sm font-bold"
              onClick={() =>
                setViewState(
                  workspace.creators.length === 0 ? "empty" : "ready",
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

  if (viewState === "empty") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <EmptyState
          title="No creators ranked"
          description="Creator discovery rankings will appear when creators publish public products."
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
              Browse creator rankings freely. Profiles remain public.
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

      <section className="app-panel space-y-2 p-4 sm:p-5">
        <p className="text-sm text-app-muted">
          Creator discovery ranking — separate from the Portfolio Leaderboard.
          This table does not use Portfolio Leaderboard points, reward weighting
          or Top-10 monthly winner messaging. Creator ranking does not earn
          monthly rewards. Likes, follows and growth are engagement/discovery
          metrics only.
        </p>
        <Link
          href={APP_ROUTES.leaderboard}
          className="inline-flex text-sm font-bold text-app-brand hover:underline"
        >
          View Portfolio Leaderboard →
        </Link>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creator or handle"
          aria-label="Search creator leaderboard"
          className="h-9 min-w-[12rem] flex-1 rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm text-app-ink"
        />
        <select
          aria-label="Category"
          value={specialty}
          onChange={(e) =>
            setSpecialty(e.target.value as CreatorSpecialty | "All")
          }
          className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-2 text-xs font-semibold text-app-ink"
        >
          <option value="All">All categories</option>
          {workspace.specialties.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-app-line bg-app-elevated px-3 text-xs font-semibold text-app-ink">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
          />
          Verified only
        </label>
      </div>

      {ranked.length === 0 ? (
        <EmptyState
          title="No search results"
          description="No creators match your search or filters."
        />
      ) : (
        <>
          {podium.length > 0 ? (
            <section aria-label="Top 3 creator podium">
              <h2 className="mb-3 app-display text-base font-semibold text-app-ink">
                Top 3
              </h2>
              <div className="grid gap-3 md:grid-cols-3">
                {podium.map((creator) => (
                  <PodiumCard key={creator.handle} creator={creator} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="app-panel overflow-hidden" aria-label="Creator table">
            <div className="border-b border-app-line bg-app-soft px-4 py-3">
              <h2 className="app-display text-base font-semibold text-app-ink">
                Creator rankings
              </h2>
              <p className="text-[11px] text-app-muted">
                Discovery order · Illustrative · not a rewards competition
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="border-b border-app-line text-[10px] uppercase tracking-wide text-app-muted">
                    <th className="px-3 py-2 font-bold">Rank</th>
                    <th className="px-3 py-2 font-bold">Creator</th>
                    <th className="px-3 py-2 font-bold">Handle</th>
                    <th className="px-3 py-2 font-bold">Followers</th>
                    <th className="px-3 py-2 font-bold">Verification</th>
                    <th className="px-3 py-2 font-bold">Public products</th>
                    <th className="px-3 py-2 font-bold">AUM</th>
                    <th className="px-3 py-2 font-bold">Investors/copiers</th>
                    <th className="px-3 py-2 font-bold">Growth</th>
                    <th className="px-3 py-2 font-bold">Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((creator) => (
                    <tr
                      key={creator.handle}
                      className="border-b border-app-line/70 last:border-0"
                    >
                      <td className="px-3 py-2.5 font-bold text-app-ink">
                        #{creator.discoveryRank}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <CreatorAvatar
                            initials={creator.avatarInitials}
                            hue={creator.avatarHue}
                            size={28}
                          />
                          <span className="font-bold text-app-ink">
                            {creator.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-app-muted">
                        @{creator.handle}
                      </td>
                      <td className="px-3 py-2.5">
                        {creator.followerCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5">
                        {creator.verified ? "Verified" : "Unverified"}
                      </td>
                      <td className="px-3 py-2.5">
                        {creator.publicProductCount}
                      </td>
                      <td className="px-3 py-2.5">
                        {formatUsd(creator.totalAumUsd, true)}
                      </td>
                      <td className="px-3 py-2.5">
                        {creator.investorsCopiers.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-app-ink">
                        {formatPercent(creator.growthPercent, true)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={APP_ROUTES.creatorProfile(creator.handle)}
                          className="font-bold text-app-brand hover:underline"
                        >
                          View Profile
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Header({ illustrative }: { illustrative: boolean }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-app-brand">
          Creator discovery
        </p>
        <h1 className="app-display text-2xl font-bold tracking-tight text-app-ink sm:text-[1.75rem]">
          Creator Leaderboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-app-muted">
          Ranks creator profiles for discovery — not monthly portfolio rewards.
        </p>
      </div>
      {illustrative ? <IllustrativeBadge /> : null}
    </header>
  );
}

function PodiumCard({ creator }: { creator: CreatorDirectoryEntry }) {
  const height =
    creator.discoveryRank === 1
      ? "md:pt-2"
      : creator.discoveryRank === 2
        ? "md:pt-6"
        : "md:pt-10";
  return (
    <article
      className={[
        "app-panel flex flex-col gap-3 border border-app-line p-4",
        height,
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <CreatorAvatar
          initials={creator.avatarInitials}
          hue={creator.avatarHue}
          size={52}
        />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">
            Rank #{creator.discoveryRank}
          </p>
          <h3 className="text-sm font-bold text-app-ink">{creator.displayName}</h3>
          <p className="text-[11px] text-app-muted">@{creator.handle}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <dt className="text-app-muted">Followers</dt>
          <dd className="font-bold text-app-ink">
            {creator.followerCount.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-app-muted">AUM</dt>
          <dd className="font-bold text-app-ink">
            {formatUsd(creator.totalAumUsd, true)}
          </dd>
        </div>
        <div>
          <dt className="text-app-muted">Products</dt>
          <dd className="font-bold text-app-ink">{creator.publicProductCount}</dd>
        </div>
        <div>
          <dt className="text-app-muted">Growth</dt>
          <dd className="font-bold text-app-ink">
            {formatPercent(creator.growthPercent, true)}
          </dd>
        </div>
      </dl>
      <Link
        href={APP_ROUTES.creatorProfile(creator.handle)}
        className="mt-auto inline-flex h-9 items-center justify-center app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
      >
        View Profile
      </Link>
    </article>
  );
}
