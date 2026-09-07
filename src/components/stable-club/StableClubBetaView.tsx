"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StableClubAvailablePools } from "@/components/stable-club/StableClubAvailablePools";
import { StableClubCompactDeposit } from "@/components/stable-club/StableClubCompactDeposit";
import { StableClubPositionDashboard } from "@/components/stable-club/StableClubPositionDashboard";
import { useFivePoolPositions } from "@/components/stable-club/useFivePoolPositions";
import { useStableClubBetaReadiness } from "@/components/stable-club/useStableClubBetaReadiness";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  FIVE_POOL_POSITIONS_REFRESH_EVENT,
  type FivePoolPositionsRefreshDetail,
} from "@/lib/stable-club/positions-refresh";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

type TabId = "position" | "pools";

function StableClubConnectedShell({ depositsEnabled }: { depositsEnabled: boolean }) {
  const positions = useFivePoolPositions();
  const hasPositions = positions.positions.length > 0;
  const booting =
    (positions.deploymentsLoading || positions.positionsLoading) && !hasPositions;
  const [tab, setTab] = useState<TabId>("pools");
  const [addFundsOpen, setAddFundsOpen] = useState(false);

  const onDepositSuccess = useCallback(() => {
    setTab("position");
    setAddFundsOpen(false);
    void positions.refreshPositions();
  }, [positions]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FivePoolPositionsRefreshDetail>).detail;
      if (detail?.reason === "deposit-confirmed") {
        setTab("position");
        setAddFundsOpen(false);
      }
    };
    window.addEventListener(FIVE_POOL_POSITIONS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(FIVE_POOL_POSITIONS_REFRESH_EVENT, handler);
  }, []);

  if (booting) {
    return (
      <section className="rounded-2xl border border-[#d7e0ec] bg-white p-8 text-center">
        <p className="text-base text-[#5b6b7c]">Loading your position…</p>
      </section>
    );
  }

  const tabBtn = (id: TabId, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={
        tab === id
          ? "rounded-lg bg-[#0b1f3a] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white"
          : "rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#5b6b7c] hover:bg-[#f0f4f8]"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Stable Club sections"
        className="inline-flex rounded-xl border border-[#d7e0ec] bg-white p-1 shadow-sm"
      >
        {tabBtn("pools", "Available Pools")}
        {tabBtn("position", "My Position")}
      </div>

      {tab === "pools" ? (
        <div className="space-y-3">
          <StableClubAvailablePools
            depositSlot={
              !hasPositions ? (
                <StableClubCompactDeposit
                  depositsEnabled={depositsEnabled}
                  onDepositSuccess={onDepositSuccess}
                  compact
                />
              ) : undefined
            }
          />
        </div>
      ) : hasPositions ? (
        <div className="space-y-3">
          <StableClubPositionDashboard
            positionsApi={positions}
            depositsEnabled={depositsEnabled}
            onAddFunds={() => setAddFundsOpen((v) => !v)}
            addFundsOpen={addFundsOpen}
          />
          {addFundsOpen ? (
            <StableClubCompactDeposit
              depositsEnabled={depositsEnabled}
              onDepositSuccess={onDepositSuccess}
              title="Add Funds"
              subtitle="New USDC is allocated 20% across all five pools"
              compact
            />
          ) : null}
        </div>
      ) : (
        <StableClubCompactDeposit
          depositsEnabled={depositsEnabled}
          onDepositSuccess={onDepositSuccess}
        />
      )}
    </div>
  );
}

/** Dev-only local screenshot fixtures — localhost only. */
function DevUiPreview({ mode }: { mode: "deposit" | "positions" | "pools" }) {
  if (mode === "pools") return <StableClubAvailablePools showDepositCta depositsEnabled />;
  if (mode === "deposit") return <StableClubCompactDeposit depositsEnabled />;
  const fixture = {
    deploymentsLoading: false,
    deployments: {
      network: "base" as const,
      chainId: 8453,
      features: { exitAllToUsdc: true },
    },
    deploymentsError: null,
    onExpectedChain: true,
    expectedChainId: 8453,
    strategyId: "0xpreview",
    strategyRegistered: true,
    strategyRevoked: false,
    strategyExpired: false,
    positions: OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool, legIndex) => ({
      legIndex,
      poolId: pool.poolIdHash,
      poolLabel: pool.label,
      tokenA: pool.tokenA.address,
      tokenB: pool.tokenB.address,
      tokenASymbol: pool.tokenA.symbol,
      tokenBSymbol: pool.tokenB.symbol,
      positionTokenId: BigInt(1000 + legIndex),
      liquidity: BigInt(1),
      amountA: BigInt(2_000_000),
      amountB: BigInt(0),
      allocationBps: BigInt(2000),
      rangeStatus: "in-range" as const,
      protocol: pool.protocol,
      npm: pool.infrastructure.npm,
      adapter: pool.infrastructure.npm,
      nftContract: pool.infrastructure.npm,
    })),
    positionsLoading: false,
    positionsError: null,
    stale: false,
    progress: "idle" as const,
    statusMessage: null,
    error: null,
    lastTxHash: null,
    explorerUrl: null,
    approvalTxHashes: [] as `0x${string}`[],
    legResults: [],
    directPlan: null,
    busy: false,
    refreshPositions: async () => undefined,
    exitIndividual: async () => undefined,
    exitAll: async () => undefined,
    exitAllToUsdc: async () => undefined,
    exitAllToUsdcAvailable: true,
    harvestAll: async () => undefined,
    compoundAll: async () => undefined,
    emergencyExitLeg: async () => undefined,
    emergencyExitAllSequential: async () => undefined,
    revokeStrategy: async () => undefined,
    showDirectExitPlan: () => undefined,
  };
  return (
    <StableClubPositionDashboard
      positionsApi={fixture as unknown as ReturnType<typeof useFivePoolPositions>}
      depositsEnabled
      onAddFunds={() => undefined}
      addFundsOpen={false}
    />
  );
}

export function StableClubBetaView({
  depositsEnabledOverride,
  loadingOverride,
}: {
  depositsEnabledOverride?: boolean;
  depositBlockersOverride?: readonly string[];
  loadingOverride?: boolean;
  errorOverride?: string | null;
  devToolsEnabled?: boolean;
} = {}) {
  const wallet = useStableClubWallet();
  const { readiness, loading } = useStableClubBetaReadiness();
  const searchParams = useSearchParams();
  const depositsEnabled = depositsEnabledOverride ?? readiness.depositsEnabled;
  const readinessLoading = loadingOverride ?? loading;
  const connected = wallet.status === "connected" && Boolean(wallet.address);
  const connecting = wallet.status === "connecting";

  const [allowUiPreview, setAllowUiPreview] = useState(false);
  useEffect(() => {
    const host = window.location.hostname;
    setAllowUiPreview(host === "localhost" || host === "127.0.0.1");
  }, []);
  const uiPreview = allowUiPreview ? searchParams.get("ui") : null;

  return (
    <div className="min-h-[70vh] bg-[#e8eef5] px-3 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        {uiPreview === "positions" || uiPreview === "deposit" || uiPreview === "pools" ? (
          <DevUiPreview mode={uiPreview} />
        ) : !connected ? (
          <section className="rounded-2xl border border-[#d7e0ec] bg-white p-10 text-center shadow-sm">
            <button
              type="button"
              disabled={connecting}
              onClick={() => void wallet.connect()}
              className="inline-flex h-12 min-w-[220px] items-center justify-center rounded-xl bg-[#0b1f3a] px-6 text-sm font-bold uppercase tracking-[0.06em] text-white disabled:opacity-50"
            >
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
            {wallet.error ? (
              <p className="mt-4 text-sm text-[#b42318]" role="alert">
                {wallet.error}
              </p>
            ) : null}
          </section>
        ) : readinessLoading ? (
          <section className="rounded-2xl border border-[#d7e0ec] bg-white p-8 text-center">
            <p className="text-base text-[#5b6b7c]">Loading…</p>
          </section>
        ) : (
          <StableClubConnectedShell depositsEnabled={depositsEnabled} />
        )}
      </div>
    </div>
  );
}
