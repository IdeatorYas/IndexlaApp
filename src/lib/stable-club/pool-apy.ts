/**
 * Trusted live pool APY from DefiLlama yields API (read-only, no API keys).
 * Fail-closed: returns unavailable when data is missing or stale.
 * APY is display-only — never gates activation, readiness, or deposits.
 */
import type { Address } from "viem";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { STAGE1_FIVE_POOL_BETA_POOL_IDS } from "@/lib/stable-club/stage1-launch";

export const POOL_APY_STALE_AFTER_MS = 6 * 60 * 60 * 1000;
export const POOL_APY_FETCH_TIMEOUT_MS = 15_000;
export const POOL_APY_RESPONSE_CACHE_MS = 5 * 60 * 1000;

const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";

const CANONICAL_POOL_ID_SET = new Set<string>(STAGE1_FIVE_POOL_BETA_POOL_IDS);

export type PoolApyQuote = {
  poolId: string;
  poolAddress: Address;
  apyPercent: number | null;
  apyBasePercent: number | null;
  apyRewardPercent: number | null;
  tvlUsd: number | null;
  source: "defillama-yields";
  updatedAt: string;
  status: "available" | "unavailable";
  unavailableReason?: string;
};

type DefiLlamaPoolRow = {
  chain?: string;
  project?: string;
  pool?: string;
  poolMeta?: string | null;
  apy?: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
  tvlUsd?: number | null;
  underlyingTokens?: string[] | null;
};

const PROJECT_BY_PROTOCOL: Record<string, string[]> = {
  "uniswap-v3": ["uniswap-v3"],
  "aerodrome-slipstream": ["aerodrome-slipstream"],
};

function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

/** Finite, non-negative APY only — otherwise unavailable. */
export function sanitizeApyPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function isCanonicalPoolApyId(poolId: string): boolean {
  return CANONICAL_POOL_ID_SET.has(poolId);
}

type ApyCacheEntry = {
  expiresAtMs: number;
  rows: DefiLlamaPoolRow[];
};

let apyRowsCache: ApyCacheEntry | null = null;

export function clearPoolApyRowsCache(): void {
  apyRowsCache = null;
}

export async function fetchDefiLlamaBasePools(
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<DefiLlamaPoolRow[]> {
  if (apyRowsCache && apyRowsCache.expiresAtMs > nowMs) {
    return apyRowsCache.rows;
  }

  const res = await fetchImpl(DEFILLAMA_POOLS_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(POOL_APY_FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`DefiLlama yields API returned ${res.status}`);
  }
  const json = (await res.json()) as { data?: DefiLlamaPoolRow[] };
  if (!Array.isArray(json.data)) {
    throw new Error("DefiLlama yields API returned unexpected shape");
  }
  apyRowsCache = {
    rows: json.data,
    expiresAtMs: nowMs + POOL_APY_RESPONSE_CACHE_MS,
  };
  return json.data;
}

function matchDefiLlamaRow(
  rows: DefiLlamaPoolRow[],
  poolAddress: Address,
  protocol: string,
  poolId: string,
): DefiLlamaPoolRow | undefined {
  const projects = PROJECT_BY_PROTOCOL[protocol] ?? [];
  const catalogue = OFFICIAL_STABLE_CLUB_BASE_POOLS.find((p) => p.id === poolId);
  if (!catalogue) return undefined;

  const tokenA = normalizeAddress(catalogue.tokenA.address);
  const tokenB = normalizeAddress(catalogue.tokenB.address);

  const candidates = rows.filter((row) => {
    if (row.chain?.toLowerCase() !== "base") return false;
    if (
      projects.length > 0 &&
      !projects.some((p) => row.project?.toLowerCase() === p.toLowerCase())
    ) {
      return false;
    }
    const under = (row.underlyingTokens ?? []).map((t) => normalizeAddress(String(t)));
    if (!under.includes(tokenA) || !under.includes(tokenB)) return false;
    return true;
  });

  // Prefer exact pool-address match when DefiLlama ever exposes it.
  const byAddress = candidates.find(
    (row) => row.pool && normalizeAddress(row.pool) === normalizeAddress(poolAddress),
  );
  if (byAddress) return byAddress;

  const meta = (row: DefiLlamaPoolRow) => String(row.poolMeta ?? "").toLowerCase();

  if (protocol === "uniswap-v3" && catalogue.feeOrTick.kind === "fee") {
    const feePct = (catalogue.feeOrTick.feeBps / 100).toFixed(
      catalogue.feeOrTick.feeBps % 100 === 0 ? 0 : 2,
    );
    // feeBps 5 → 0.05%
    const feeLabel =
      catalogue.feeOrTick.feeBps === 5
        ? "0.05%"
        : catalogue.feeOrTick.feeBps === 30
          ? "0.3%"
          : `${feePct}%`;
    const hit = candidates.find((row) => meta(row) === feeLabel.toLowerCase());
    if (hit) return hit;
  }

  if (
    protocol === "aerodrome-slipstream" &&
    catalogue.feeOrTick.kind === "tickSpacing"
  ) {
    // DefiLlama meta looks like "CL10 - 0.055%" / "CL100 - 0.25%".
    // Do not use startsWith("cl10") — that falsely matches CL100.
    const tick = catalogue.feeOrTick.tickSpacing;
    const hit = candidates.find((row) => {
      const m = meta(row).match(/^cl(\d+)/i);
      return m != null && Number(m[1]) === tick;
    });
    if (hit) return hit;
  }

  // Fail closed — do not pick an arbitrary same-pair pool (would mislead APY).
  return undefined;
}

export function buildPoolApyQuotes(rows: DefiLlamaPoolRow[], fetchedAt: Date): PoolApyQuote[] {
  const now = fetchedAt.toISOString();
  const canonicalPools = OFFICIAL_STABLE_CLUB_BASE_POOLS.filter((pool) =>
    isCanonicalPoolApyId(pool.id),
  );
  return canonicalPools.map((pool) => {
    if (!pool.poolAddress) {
      return {
        poolId: pool.id,
        poolAddress: "0x0000000000000000000000000000000000000000",
        apyPercent: null,
        apyBasePercent: null,
        apyRewardPercent: null,
        tvlUsd: null,
        source: "defillama-yields",
        updatedAt: now,
        status: "unavailable",
        unavailableReason: "Pool address not configured",
      };
    }

    const match = matchDefiLlamaRow(rows, pool.poolAddress, pool.protocol, pool.id);
    const apyPercent = sanitizeApyPercent(match?.apy);
    if (!match || apyPercent == null) {
      return {
        poolId: pool.id,
        poolAddress: pool.poolAddress,
        apyPercent: null,
        apyBasePercent: null,
        apyRewardPercent: null,
        tvlUsd:
          typeof match?.tvlUsd === "number" && Number.isFinite(match.tvlUsd) && match.tvlUsd >= 0
            ? match.tvlUsd
            : null,
        source: "defillama-yields",
        updatedAt: now,
        status: "unavailable",
        unavailableReason: "No live APY from trusted source",
      };
    }

    return {
      poolId: pool.id,
      poolAddress: pool.poolAddress,
      apyPercent,
      apyBasePercent: sanitizeApyPercent(match.apyBase),
      apyRewardPercent: sanitizeApyPercent(match.apyReward),
      tvlUsd:
        typeof match.tvlUsd === "number" && Number.isFinite(match.tvlUsd) && match.tvlUsd >= 0
          ? match.tvlUsd
          : null,
      source: "defillama-yields",
      updatedAt: now,
      status: "available",
    };
  });
}

export async function fetchOfficialPoolApyQuotes(): Promise<{
  quotes: PoolApyQuote[];
  fetchedAt: string;
}> {
  const fetchedAt = new Date();
  const rows = await fetchDefiLlamaBasePools();
  return {
    quotes: buildPoolApyQuotes(rows, fetchedAt),
    fetchedAt: fetchedAt.toISOString(),
  };
}

export function isPoolApyStale(updatedAtIso: string, nowMs = Date.now()): boolean {
  const updated = Date.parse(updatedAtIso);
  if (!Number.isFinite(updated)) return true;
  return nowMs - updated > POOL_APY_STALE_AFTER_MS;
}

export const FIVE_POOL_STRATEGY_ALLOCATION_FRACTION = 0.2;

export type BlendedStrategyApy = {
  apyPercent: number | null;
  status: "available" | "unavailable";
  source: "defillama-yields";
  updatedAt: string | null;
  unavailableReason?: string;
  legCount: number;
  legsWithApy: number;
};

/** Equal 20% weighting across five strategy legs — never hardcode rates. */
export function computeBlendedStrategyApy(
  quotes: readonly PoolApyQuote[],
  fetchedAt: string | null,
): BlendedStrategyApy {
  const available = quotes.filter((q) => q.status === "available" && q.apyPercent != null);
  if (available.length !== quotes.length || quotes.length !== 5) {
    return {
      apyPercent: null,
      status: "unavailable",
      source: "defillama-yields",
      updatedAt: fetchedAt,
      unavailableReason:
        available.length === 0
          ? "No live APY from trusted source"
          : "One or more pool APY quotes unavailable",
      legCount: quotes.length,
      legsWithApy: available.length,
    };
  }
  const blended =
    available.reduce((sum, q) => sum + (q.apyPercent ?? 0) * FIVE_POOL_STRATEGY_ALLOCATION_FRACTION, 0);
  const updatedAt = fetchedAt ?? available[0]?.updatedAt ?? null;
  if (updatedAt && isPoolApyStale(updatedAt)) {
    return {
      apyPercent: null,
      status: "unavailable",
      source: "defillama-yields",
      updatedAt,
      unavailableReason: `APY older than ${POOL_APY_STALE_AFTER_MS / 3_600_000}h`,
      legCount: quotes.length,
      legsWithApy: available.length,
    };
  }
  return {
    apyPercent: blended,
    status: "available",
    source: "defillama-yields",
    updatedAt,
    legCount: quotes.length,
    legsWithApy: available.length,
  };
}
