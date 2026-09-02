"use client";

import { useEffect, useMemo, useState } from "react";
import { StableClubBetaPoolCard } from "@/components/stable-club/StableClubBetaPoolCard";
import { StableClubFivePoolDepositPanel } from "@/components/stable-club/StableClubFivePoolDepositPanel";
import { StableClubFivePoolPositionsPanel } from "@/components/stable-club/StableClubFivePoolPositionsPanel";
import { useStableClubBetaReadiness } from "@/components/stable-club/useStableClubBetaReadiness";
import { useFivePoolPositions } from "@/components/stable-club/useFivePoolPositions";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import {
  computeBlendedStrategyApy,
  type PoolApyQuote,
} from "@/lib/stable-club/pool-apy";
import {
  STABLE_CLUB_MIN_DEPOSIT_USD,
  resolvePoolProductCategory,
} from "@/lib/stable-club/pool-product-meta";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";

const FAQ_ITEMS = [
  {
    q: "Is INDEXLA Stable Club custodial?",
    a: "No. You keep wallet custody. One depositFivePoolStrategy transaction mints five LP NFTs directly to your address. INDEXLA contracts execute only within permissions you authorize.",
  },
  {
    q: "How does the five-pool strategy work?",
    a: "You enter one USDC amount. One atomic on-chain transaction allocates 20% into each of five verified Base pools. If any leg fails, the entire transaction reverts.",
  },
  {
    q: "What is the minimum deposit?",
    a: `The private beta minimum is $${STABLE_CLUB_MIN_DEPOSIT_USD} USDC per strategy deposit, subject to the configured per-transaction caps.`,
  },
  {
    q: "Which networks are supported?",
    a: "This beta targets Base Mainnet (chainId 8453). Your wallet must be connected to Base to deposit.",
  },
  {
    q: "Are harvest, compound and rebalance automated?",
    a: "No. Automation remains disabled for the private beta. You initiate deposits and exits from your wallet.",
  },
  {
    q: "How is APY shown?",
    a: "Estimated pool APY is fetched from DefiLlama yields (read-only). Blended strategy APY is the equal 20% weighted sum. If data is missing or stale, the UI shows Unavailable — never a hardcoded rate.",
  },
] as const;

const POOL_RISK_DETAILS: Record<string, string> = {
  "USDC-cbBTC-AERO-CL100":
    "Stable · USDC/cbBTC on Aerodrome Slipstream CL100 (legacy factory). Stablecoin-heavy leg with concentrated liquidity impermanent loss risk.",
  "USDC-cbBTC-UNI-005":
    "Stable-Weighted · USDC/cbBTC on Uniswap V3 0.05%. Primary stable pair with medium risk classification.",
  "cbBTC-WETH-AERO-CL10":
    "Growth · cbBTC/WETH on Aerodrome Slipstream CL10. Higher volatility; high risk with same audited caps.",
  "cbBTC-WETH-AERO-CL100":
    "Growth · cbBTC/WETH on Aerodrome Slipstream CL100 (legacy factory). Separate legacy NPM bindings — wrong-generation adapters are rejected on-chain.",
  "cbBTC-WETH-UNI-005":
    "Growth · cbBTC/WETH on Uniswap V3 0.05%. Higher volatility leg classified high risk.",
};

export function StableClubBetaView({ devToolsEnabled = false }: { devToolsEnabled?: boolean }) {
  const { readiness, loading, error, isLocalHardhat } = useStableClubBetaReadiness();
  const positions = useFivePoolPositions();
  const [apyQuotes, setApyQuotes] = useState<PoolApyQuote[]>([]);
  const [apyFetchedAt, setApyFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stable-club/pool-apy");
        const json = (await res.json()) as { quotes?: PoolApyQuote[]; fetchedAt?: string };
        if (cancelled) return;
        setApyQuotes(json.quotes ?? []);
        setApyFetchedAt(json.fetchedAt ?? null);
      } catch {
        if (!cancelled) {
          setApyQuotes([]);
          setApyFetchedAt(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apyByPoolId = useMemo(() => {
    const map = new Map<string, PoolApyQuote>();
    for (const q of apyQuotes) map.set(q.poolId, q);
    return map;
  }, [apyQuotes]);

  const blendedApy = useMemo(
    () => computeBlendedStrategyApy(apyQuotes, apyFetchedAt),
    [apyQuotes, apyFetchedAt],
  );

  const positionStatusByPoolId = useMemo(() => {
    const map = new Map<string, "open" | "none">();
    for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
      map.set(pool.id, "none");
    }
    for (const pos of positions.positions) {
      const pool = OFFICIAL_STABLE_CLUB_BASE_POOLS.find(
        (p) => p.poolIdHash.toLowerCase() === pos.poolId.toLowerCase(),
      );
      if (pool) map.set(pool.id, "open");
    }
    return map;
  }, [positions.positions]);

  const blendedApyLabel =
    blendedApy.status === "available" && blendedApy.apyPercent != null
      ? `${blendedApy.apyPercent.toFixed(2)}%`
      : "Unavailable";

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
      <header className="space-y-4 text-center sm:text-left">
        <p className="app-label text-app-brand">INDEXLA STABLE CLUB</p>
        <h1 className="app-display text-3xl font-bold tracking-tight text-app-ink sm:text-4xl">
          One Deposit. Five Liquidity Pools.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-app-muted">
          Diversify one USDC deposit across five selected Base DEX pools while retaining ownership of
          every position.
        </p>
        <p className="text-xs font-semibold uppercase tracking-wide text-app-dim">
          Non-Custodial · No Lending · No Borrowing
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={[
              "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide",
              readiness.globalStatus === "Live"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
            ].join(" ")}
          >
            {loading ? "Checking status…" : readiness.globalStatus}
          </span>
          <span className="text-[11px] text-app-dim">
            Est. blended strategy APY:{" "}
            <strong className="text-app-ink">{blendedApyLabel}</strong>
            {blendedApy.updatedAt ? (
              <> · DefiLlama · {new Date(blendedApy.updatedAt).toLocaleString()}</>
            ) : null}
          </span>
          {error ? <span className="text-[11px] text-app-danger">{error}</span> : null}
          {isLocalHardhat ? (
            <span className="text-[11px] text-amber-600 dark:text-amber-300">
              Local Hardhat attestation (dev)
            </span>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="strategy-heading">
        <h2 id="strategy-heading" className="sr-only">
          Five-pool strategy deposit
        </h2>
        {!readiness.depositsEnabled && readiness.depositBlockers.length > 0 ? (
          <div className="mb-4 rounded-[12px] border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-app-muted">
            <p className="font-semibold text-app-ink">Atomic deposit blocked</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {readiness.depositBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <StableClubFivePoolDepositPanel
          depositsEnabled={readiness.depositsEnabled}
          variant="product"
        />
        <p className="mt-2 text-[10px] text-app-dim">
          Caps: min ${STABLE_CLUB_MIN_DEPOSIT_USD} · per user $
          {PRIVATE_BETA_LAUNCH_PARAMS.capsUsd.perUser.toLocaleString()} · per tx $
          {PRIVATE_BETA_LAUNCH_PARAMS.capsUsd.perTransaction.toLocaleString()}
        </p>
      </section>

      <section aria-labelledby="components-heading">
        <h2 id="components-heading" className="text-lg font-bold text-app-ink">
          Strategy components (20% each)
        </h2>
        <p className="mt-1 text-xs text-app-muted">
          Informational pool cards — not separate products. One deposit allocates equally across all
          five legs.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool) => (
            <StableClubBetaPoolCard
              key={pool.id}
              pool={pool}
              apy={apyByPoolId.get(pool.id)}
              positionStatus={positionStatusByPoolId.get(pool.id) ?? "none"}
            />
          ))}
        </div>
        {apyFetchedAt ? (
          <p className="mt-2 text-[10px] text-app-dim">
            Pool APY source: DefiLlama yields · last fetch {new Date(apyFetchedAt).toLocaleString()}
          </p>
        ) : null}
      </section>

      <section className="rounded-[16px] border border-app-line bg-app-panel/60 p-5 sm:p-6">
        <h2 className="text-lg font-bold text-app-ink">Pool risks &amp; explanations</h2>
        <ul className="mt-4 space-y-4">
          {OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool) => (
            <li key={pool.id} className="border-b border-app-line/60 pb-4 last:border-0 last:pb-0">
              <h3 className="text-sm font-bold text-app-ink">
                {pool.tokenA.symbol}/{pool.tokenB.symbol} · {resolvePoolProductCategory(pool.id)}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-app-muted">
                {POOL_RISK_DETAILS[pool.id] ?? pool.label}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-app-muted">
          Concentrated liquidity carries impermanent loss, smart-contract, oracle and bridge risk.
          Legacy Aerodrome CL100 pools use separate factory/NPM bindings — wrong-generation adapters
          are rejected on-chain. Harvest, compound and rebalance automation remain disabled.
        </p>
      </section>

      <section aria-labelledby="positions-heading">
        <h2 id="positions-heading" className="text-lg font-bold text-app-ink">
          Your positions
        </h2>
        <p className="mt-1 text-xs text-app-muted">
          After deposit you own five LP NFTs. Exit All is atomic on-chain; individual leg exits remain
          available.
        </p>
        <div className="mt-4">
          <StableClubFivePoolPositionsPanel />
        </div>
      </section>

      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-lg font-bold text-app-ink">
          FAQ
        </h2>
        <dl className="mt-4 space-y-4">
          {FAQ_ITEMS.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-semibold text-app-ink">{item.q}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-app-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="rounded-[12px] border border-red-500/25 bg-red-500/5 p-4 text-[11px] leading-relaxed text-app-muted">
        <strong className="text-app-ink">Risk disclaimer.</strong> Digital assets are volatile.
        Concentrated liquidity strategies can lose value including impermanent loss. INDEXLA does not
        custody funds. Past APY is not indicative of future returns. This interface does not provide
        investment advice. Use only funds you can afford to lose.
      </footer>

      {devToolsEnabled ? (
        <p className="text-[10px] text-app-dim">
          Developer tools enabled — internal test pool and Step 1/2 panels available below.
        </p>
      ) : null}
    </div>
  );
}
