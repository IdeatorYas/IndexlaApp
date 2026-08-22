"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CreatorDirectoryEntry,
  CreatorHubSort,
  CreatorHubUserStatus,
  CreatorSpecialty,
  CreatorsWorkspace,
} from "@/lib/domain/creators";
import type { NetworkId } from "@/lib/domain/types";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";

type ViewState = "loading" | "ready" | "error" | "empty";

const HUB_STATUS_COPY: Record<
  CreatorHubUserStatus,
  { title: string; body: string; cta: string; href: string }
> = {
  "not-started": {
    title: "Become a Creator",
    body: "Publish a public portfolio, connect socials and submit verification to unlock creator tools.",
    cta: "Become a Creator",
    href: APP_ROUTES.creatorActivate,
  },
  "setup-incomplete": {
    title: "Continue Setup",
    body: "Your creator activation is incomplete. Finish the remaining steps to submit verification.",
    cta: "Continue Setup",
    href: APP_ROUTES.creatorActivate,
  },
  "awaiting-verification": {
    title: "Verification Pending",
    body: "Your submission is under review. Creator Dashboard unlocks after approval.",
    cta: "View Activation Status",
    href: APP_ROUTES.creatorActivate,
  },
  approved: {
    title: "Open Creator Dashboard",
    body: "You are an approved creator. Manage products, earnings and audience from your dashboard.",
    cta: "Open Creator Dashboard",
    href: APP_ROUTES.creatorDashboard,
  },
};

export function CreatorsHubView({
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
  const [network, setNetwork] = useState<NetworkId | "All">("All");
  const [sort, setSort] = useState<CreatorHubSort>("most-followed");
  const [hubStatus, setHubStatus] = useState<CreatorHubUserStatus>(
    workspace.viewerHubStatus,
  );
  const [following, setFollowing] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      workspace.creators.map((c) => [c.handle, c.initiallyFollowing]),
    ),
  );
  const [notify, setNotify] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      workspace.creators.map((c) => [c.handle, c.initiallyNotify]),
    ),
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => {
      setViewState(workspace.creators.length === 0 ? "empty" : "ready");
    }, 280);
    return () => window.clearTimeout(timer);
  }, [initialError, workspace.creators.length]);

  function preview(action: string) {
    setMessage(
      `${action} — preview only. No real notification, tip or transaction was submitted.`,
    );
  }

  const filtered = useMemo(() => {
    let list = [...workspace.creators];
    if (specialty !== "All") {
      list = list.filter((c) => c.specialty === specialty);
    }
    if (verifiedOnly) list = list.filter((c) => c.verified);
    if (network !== "All") {
      list = list.filter((c) => c.networkIds.includes(network));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.handle.toLowerCase().includes(q) ||
          c.specialty.toLowerCase().includes(q),
      );
    }
    switch (sort) {
      case "newest":
        return list.sort((a, b) =>
          b.creatorSince.localeCompare(a.creatorSince),
        );
      case "highest-aum":
        return list.sort((a, b) => b.totalAumUsd - a.totalAumUsd);
      case "most-followed":
      default:
        return list.sort((a, b) => b.followerCount - a.followerCount);
    }
  }, [workspace.creators, specialty, verifiedOnly, network, query, sort]);

  const featured = filtered.filter((c) => c.featured);

  if (viewState === "loading") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <LoadingSkeleton title="Loading Creator Hub" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <ErrorState
          title="Creators unavailable"
          description="Unable to load Creator Hub directory."
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
          title="No creators yet"
          description="When creators publish public products, they will appear here."
        />
      </div>
    );
  }

  const status = HUB_STATUS_COPY[hubStatus];

  return (
    <div className="mx-auto space-y-5" style={{ maxWidth: "var(--content-max)" }}>
      <Header illustrative={illustrative} />

      {wallet.state !== "connected" ? (
        <div className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">Wallet disconnected</p>
            <p className="mt-0.5 text-xs text-app-muted">
              Browse creators freely. Connect for Follow and Notify previews.
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

      {message ? (
        <p className="rounded-[10px] border border-app-line bg-app-soft px-3 py-2 text-xs text-app-muted">
          {message}
        </p>
      ) : null}

      <section className="app-panel space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">
              Creator Hub
            </p>
            <h2 className="app-display text-lg font-bold text-app-ink">
              {status.title}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-app-muted">{status.body}</p>
          </div>
          <Link
            href={status.href}
            className="inline-flex h-10 items-center rounded-[10px] bg-app-brand px-4 text-[12px] font-bold text-white"
          >
            {status.cta}
          </Link>
        </div>
        {illustrative ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-app-muted">
              Demo status
            </span>
            {(
              [
                "not-started",
                "setup-incomplete",
                "awaiting-verification",
                "approved",
              ] as CreatorHubUserStatus[]
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setHubStatus(s)}
                className={[
                  "h-7 rounded-full px-2.5 text-[10px] font-bold",
                  hubStatus === s
                    ? "bg-app-brand text-white"
                    : "border border-app-line text-app-muted",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <GatewayLink href={APP_ROUTES.creatorLeaderboard} label="Creator Leaderboard" />
          <GatewayLink href={APP_ROUTES.creatorActivate} label="Creator Activation" />
          {hubStatus === "approved" ? (
            <GatewayLink
              href={APP_ROUTES.creatorDashboard}
              label="Creator Dashboard"
            />
          ) : (
            <span className="inline-flex h-8 items-center rounded-[10px] border border-dashed border-app-line px-3 text-[11px] font-semibold text-app-muted">
              Creator Dashboard · unlocks after approval
            </span>
          )}
        </div>
        <p className="text-[11px] text-app-muted">
          Creator Hub stays at `/app/creators`. Ordinary users are never routed
          directly to Creator Dashboard.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creator name or handle"
          aria-label="Search creators"
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
        <select
          aria-label="Network"
          value={network}
          onChange={(e) => setNetwork(e.target.value as NetworkId | "All")}
          className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-2 text-xs font-semibold text-app-ink"
        >
          <option value="All">All networks</option>
          {workspace.networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as CreatorHubSort)}
          className="h-9 rounded-[10px] border border-app-line bg-app-elevated px-2 text-xs font-semibold text-app-ink"
        >
          <option value="most-followed">Most followed</option>
          <option value="highest-aum">Highest AUM</option>
          <option value="newest">Newest</option>
        </select>
        <label className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-app-line bg-app-elevated px-3 text-xs font-semibold text-app-ink">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
          />
          Verified
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No search results"
          description="No creators match your search or filters. Try another name, handle or filter."
        />
      ) : (
        <>
          {featured.length > 0 ? (
            <section className="space-y-3">
              <h2 className="app-display text-base font-semibold text-app-ink">
                Featured Creators
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {featured.map((creator) => (
                  <CreatorCard
                    key={`feat-${creator.handle}`}
                    creator={creator}
                    following={Boolean(following[creator.handle])}
                    notifying={Boolean(notify[creator.handle])}
                    onFollow={() => {
                      if (wallet.state !== "connected") {
                        connectDemo();
                        preview("Follow");
                        return;
                      }
                      setFollowing((prev) => {
                        const next = !prev[creator.handle];
                        preview(next ? `Following @${creator.handle}` : `Unfollowed @${creator.handle}`);
                        return { ...prev, [creator.handle]: next };
                      });
                    }}
                    onNotify={() => {
                      if (wallet.state !== "connected") {
                        connectDemo();
                        preview("Notify");
                        return;
                      }
                      if (!following[creator.handle]) {
                        preview("Follow first to enable new-portfolio notifications");
                        return;
                      }
                      setNotify((prev) => {
                        const next = !prev[creator.handle];
                        preview(
                          next
                            ? `Notify on for @${creator.handle}`
                            : `Notify off for @${creator.handle}`,
                        );
                        return { ...prev, [creator.handle]: next };
                      });
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="app-display text-base font-semibold text-app-ink">
              All Creators
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((creator) => (
                <CreatorCard
                  key={creator.handle}
                  creator={creator}
                  following={Boolean(following[creator.handle])}
                  notifying={Boolean(notify[creator.handle])}
                  onFollow={() => {
                    if (wallet.state !== "connected") {
                      connectDemo();
                      preview("Follow");
                      return;
                    }
                    setFollowing((prev) => {
                      const next = !prev[creator.handle];
                      preview(
                        next
                          ? `Following @${creator.handle}`
                          : `Unfollowed @${creator.handle}`,
                      );
                      return { ...prev, [creator.handle]: next };
                    });
                  }}
                  onNotify={() => {
                    if (wallet.state !== "connected") {
                      connectDemo();
                      preview("Notify");
                      return;
                    }
                    if (!following[creator.handle]) {
                      preview(
                        "Follow first to enable new-portfolio notifications",
                      );
                      return;
                    }
                    setNotify((prev) => {
                      const next = !prev[creator.handle];
                      preview(
                        next
                          ? `Notify on for @${creator.handle}`
                          : `Notify off for @${creator.handle}`,
                      );
                      return { ...prev, [creator.handle]: next };
                    });
                  }}
                />
              ))}
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
        <h1 className="app-display text-2xl font-bold tracking-tight text-app-ink sm:text-[1.75rem]">
          Creators
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-app-muted">
          Discover verified creators, follow products and open activation when
          you are ready.
        </p>
      </div>
      {illustrative ? (
        <span className="rounded-full bg-app-warning/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-app-warning">
          Illustrative
        </span>
      ) : null}
    </header>
  );
}

function GatewayLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center rounded-[10px] border border-app-line bg-app-elevated px-3 text-[11px] font-bold text-app-ink hover:border-app-brand/40"
    >
      {label} →
    </Link>
  );
}

function CreatorCard({
  creator,
  following,
  notifying,
  onFollow,
  onNotify,
}: {
  creator: CreatorDirectoryEntry;
  following: boolean;
  notifying: boolean;
  onFollow: () => void;
  onNotify: () => void;
}) {
  return (
    <article className="app-panel flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <CreatorAvatar
          initials={creator.avatarInitials}
          hue={creator.avatarHue}
          size={48}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-bold text-app-ink">
              {creator.displayName}
            </h3>
            {creator.verified ? (
              <span className="rounded-md bg-app-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-brand">
                Verified
              </span>
            ) : null}
            {creator.isIllustrative ? (
              <span className="rounded-md bg-app-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-warning">
                Illustrative
              </span>
            ) : null}
          </div>
          <p className="text-[11px] font-semibold text-app-muted">
            @{creator.handle} · {creator.specialty}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <Metric label="Followers" value={creator.followerCount.toLocaleString()} />
        <Metric
          label="Notify subs"
          value={creator.notificationSubscriberCount.toLocaleString()}
        />
        <Metric
          label="Public products"
          value={String(creator.publicProductCount)}
        />
        <Metric
          label="Best performance"
          value={formatPercent(creator.bestPerformancePercent, true)}
        />
        <Metric label="Total AUM" value={formatUsd(creator.totalAumUsd, true)} />
        <Metric
          label="Investors/copiers"
          value={creator.investorsCopiers.toLocaleString()}
        />
      </dl>

      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onFollow}
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
            checked={notifying}
            onChange={onNotify}
            aria-label={`Notify Me About New Portfolios for @${creator.handle}`}
          />
          Notify Me About New Portfolios
        </label>
        <Link
          href={APP_ROUTES.creatorProfile(creator.handle)}
          className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
        >
          View Creator Profile
        </Link>
      </div>
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
