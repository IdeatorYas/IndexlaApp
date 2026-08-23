"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  DiscoverCatalog,
  DiscoverSort,
  IndexType,
  MarketplaceProduct,
  MarketplaceStrategyTag,
  NarrativeId,
  ProductTab,
} from "@/lib/domain/marketplace";
import type { ProductRisk } from "@/lib/domain/dashboard";
import type { NetworkId } from "@/lib/domain/types";
import { ProductDetailPanel } from "@/components/product/ProductDetailPanel";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { MarketplaceExplorer } from "@/components/marketplace/MarketplaceExplorer";
import type { MarketplaceFilterState } from "@/lib/domain/marketplace-filters";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { APP_ROUTES } from "@/lib/routes";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";

type LoadState = "loading" | "ready" | "empty" | "error";

function parseProductTab(raw: string | null): ProductTab {
  if (raw === "portfolios") return "portfolios";
  return "indexes";
}

function parseIndexType(raw: string | null): IndexType {
  if (
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

function parseStrategy(raw: string | null): MarketplaceStrategyTag | "All" {
  if (
    raw === "buy-fear-sell-greed" ||
    raw === "rsi" ||
    raw === "tp-sl" ||
    raw === "momentum"
  ) {
    return raw;
  }
  return "All";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { wallet, connectDemo } = useDemoWallet();

  const [loadState, setLoadState] = useState<LoadState>(
    initialError ? "error" : "loading",
  );

  const selectedId = searchParams.get("id");

  const initialState = useMemo<Partial<MarketplaceFilterState>>(
    () => ({
      productTab: parseProductTab(searchParams.get("tab")),
      indexType: parseIndexType(searchParams.get("type")),
      narrative: parseNarrative(searchParams.get("narrative")),
      query: searchParams.get("q") ?? "",
      risk: (searchParams.get("risk") as ProductRisk | null) ?? "All",
      network: (searchParams.get("network") as NetworkId | null) ?? "All",
      strategy: parseStrategy(searchParams.get("strategy")),
      sort: parseSort(searchParams.get("sort")),
    }),
    [searchParams],
  );

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => {
      setLoadState(catalog.products.length === 0 ? "empty" : "ready");
    }, 280);
    return () => window.clearTimeout(timer);
  }, [catalog.products.length, initialError]);

  const syncParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === "All" || value === "all") params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const selected = useMemo(
    () => catalog.products.find((p) => p.id === selectedId) ?? null,
    [catalog.products, selectedId],
  );

  if (loadState === "loading") {
    return (
      <div className="space-y-4">
        <LoadingSkeleton title="Loading Discover" lines={4} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <LoadingSkeleton lines={5} />
          <LoadingSkeleton lines={5} />
          <LoadingSkeleton lines={5} />
        </div>
      </div>
    );
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
            onClick={() => setLoadState("ready")}
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
            Full INDEXLA index catalog with narrative, risk, network and strategy
            filters.
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

      {selected ? (
        <ProductDetailPanel
          product={selected}
          onClose={() => syncParams({ id: null })}
          walletConnected={wallet.state === "connected"}
          onConnect={connectDemo}
        />
      ) : null}

      <MarketplaceExplorer
        catalog={catalog}
        variant="discover"
        initialState={initialState}
        syncUrl={syncParams}
        onProductClick={(product: MarketplaceProduct) =>
          syncParams({ id: product.id })
        }
      />
    </div>
  );
}
