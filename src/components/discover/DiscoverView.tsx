"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DiscoverCatalog } from "@/lib/domain/marketplace";
import type {
  AssetCategory,
  MarketplaceFilterState,
} from "@/lib/domain/marketplace-filters";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { MarketplaceExplorer } from "@/components/marketplace/MarketplaceExplorer";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { APP_ROUTES } from "@/lib/routes";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import type { DiscoverSort, NarrativeId, ProductTab } from "@/lib/domain/marketplace";

type LoadState = "loading" | "ready" | "empty" | "error";

function parseProductTab(raw: string | null): ProductTab {
  if (raw === "portfolios") return "portfolios";
  return "indexes";
}

function parseAssetCategory(raw: string | null): AssetCategory {
  if (raw === "All") return "All";
  if (
    raw === "Crypto" ||
    raw === "Tokenized Stocks" ||
    raw === "Tokenized Commodities" ||
    raw === "Hybrid"
  ) {
    return raw;
  }
  return "Crypto";
}

function parseSort(raw: string | null): DiscoverSort {
  if (
    raw === "best-performance" ||
    raw === "highest-aum" ||
    raw === "highest-volume" ||
    raw === "most-investors" ||
    raw === "recently-added"
  ) {
    return raw;
  }
  return "trending";
}

function parseNarrative(raw: string | null): NarrativeId {
  if (!raw || raw === "all") return "all";
  return raw as NarrativeId;
}

export function DiscoverView({
  catalog,
  illustrative,
  initialError = false,
}: {
  catalog: DiscoverCatalog;
  illustrative: boolean;
  initialError?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { wallet, connectDemo } = useDemoWallet();

  const selectedId = searchParams.get("id");

  useEffect(() => {
    if (selectedId) {
      router.replace(APP_ROUTES.product(selectedId));
    }
  }, [selectedId, router]);

  const initialState: Partial<MarketplaceFilterState> = {
    productTab: parseProductTab(searchParams.get("tab")),
    assetCategory: parseAssetCategory(searchParams.get("type")),
    narrative: parseNarrative(searchParams.get("narrative")),
    query: searchParams.get("q") ?? "",
    sort: parseSort(searchParams.get("sort")),
  };

  const loadState: LoadState = initialError
    ? "error"
    : catalog.products.length === 0
      ? "empty"
      : "ready";

  if (selectedId) {
    return <LoadingSkeleton title="Opening product" lines={4} />;
  }

  if (loadState === "error") {
    return (
      <ErrorState
        title="Discover unavailable"
        description="Marketplace catalog could not be loaded. Retry or continue browsing illustrative fixtures."
        action={
          <button
            type="button"
            className="app-gradient-btn rounded-[10px] px-4 py-2 text-sm font-bold"
            onClick={() => router.refresh()}
          >
            Retry
          </button>
        }
      />
    );
  }

  if (loadState === "empty") {
    return (
      <EmptyState
        title="Catalog empty"
        description="No marketplace products are available in this preview build."
      />
    );
  }

  const syncParams = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "All" || value === "all") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${APP_ROUTES.discover}?${qs}` : APP_ROUTES.discover, {
      scroll: false,
    });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="app-display text-2xl font-bold text-app-ink sm:text-[1.75rem]">
              Discover
            </h1>
            {illustrative ? <IllustrativeBadge compact /> : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-app-muted">
            Full INDEXLA index and portfolio catalog with asset category and
            index narrative filters.
          </p>
        </div>
        <Link
          href={APP_ROUTES.create}
          className="app-gradient-btn inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-[13px] font-bold"
        >
          Create Portfolio / Index
        </Link>
      </header>

      {wallet.state !== "connected" ? (
        <div className="app-panel flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-app-ink">
              Wallet disconnected
            </p>
            <p className="mt-0.5 text-xs text-app-muted">
              Browse indexes and portfolios freely. Connect only for invest,
              follow, tip or customization.
            </p>
          </div>
          <button
            type="button"
            onClick={connectDemo}
            className="h-9 shrink-0 rounded-[10px] bg-app-brand px-4 text-[12px] font-bold text-white"
          >
            Connect Wallet
          </button>
        </div>
      ) : null}

      <MarketplaceExplorer
        catalog={catalog}
        variant="discover"
        initialState={initialState}
        syncUrl={syncParams}
      />
    </div>
  );
}
