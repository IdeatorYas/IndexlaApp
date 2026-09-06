"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StableClubCompactDeposit } from "@/components/stable-club/StableClubCompactDeposit";
import { StableClubPositionDashboard } from "@/components/stable-club/StableClubPositionDashboard";
import { useFivePoolPositions } from "@/components/stable-club/useFivePoolPositions";
import { useStableClubBetaReadiness } from "@/components/stable-club/useStableClubBetaReadiness";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

function StableClubConnectedShell({ depositsEnabled }: { depositsEnabled: boolean }) {
  const positions = useFivePoolPositions();
  const hasPositions = positions.positions.length > 0;
  const booting =
    (positions.deploymentsLoading || positions.positionsLoading) && !hasPositions;

  if (booting) {
    return (
      <section className="rounded-2xl border border-[#d7e0ec] bg-white p-8 text-center shadow-[0_1px_2px_rgba(11,31,58,0.06)]">
        <p className="text-base text-[#5b6b7c]">Loading your position…</p>
      </section>
    );
  }

  if (hasPositions) {
    return <StableClubPositionDashboard positionsApi={positions} />;
  }

  return <StableClubCompactDeposit depositsEnabled={depositsEnabled} />;
}

/** Dev-only local screenshot fixtures — never used in production builds. */
function DevUiPreview({ mode }: { mode: "deposit" | "positions" }) {
  if (mode === "deposit") {
    return <StableClubCompactDeposit depositsEnabled />;
  }
  const fixture = {
    deploymentsLoading: false,
    deployments: { network: "base" as const, chainId: 8453 },
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
      tokenASymbol: pool.tokenA.symbol,
      tokenBSymbol: pool.tokenB.symbol,
      positionTokenId: BigInt(1000 + legIndex),
      liquidity: BigInt(1),
      amountA: BigInt(2_000_000),
      amountB: BigInt(0),
      allocationBps: BigInt(2000),
      rangeStatus: "in-range" as const,
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
    exitAllToUsdcAvailable: false,
    emergencyExitLeg: async () => undefined,
    emergencyExitAllSequential: async () => undefined,
    revokeStrategy: async () => undefined,
    showDirectExitPlan: () => undefined,
  };
  return (
    <StableClubPositionDashboard
      positionsApi={fixture as unknown as ReturnType<typeof useFivePoolPositions>}
    />
  );
}

/**
 * Stable Club product page — three states only:
 * disconnected → Connect Wallet
 * connected, no positions → compact deposit
 * connected, with positions → My Stable Club Position dashboard
 */
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
    <div className="min-h-[70vh] bg-[#f4f7fb] px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        {uiPreview === "positions" || uiPreview === "deposit" ? (
          <DevUiPreview mode={uiPreview} />
        ) : !connected ? (
          <section className="rounded-2xl border border-[#d7e0ec] bg-white p-10 text-center shadow-[0_1px_2px_rgba(11,31,58,0.06)]">
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
          <section className="rounded-2xl border border-[#d7e0ec] bg-white p-8 text-center shadow-[0_1px_2px_rgba(11,31,58,0.06)]">
            <p className="text-base text-[#5b6b7c]">Loading…</p>
          </section>
        ) : (
          <StableClubConnectedShell depositsEnabled={depositsEnabled} />
        )}
      </div>
    </div>
  );
}
