/**
 * Five-pool position discovery and exit-arg builders.
 * Discovery: NPM (or local mock adapter NFT) Transfer mints → adapter ownership/token checks.
 * Exit All is atomic on-chain (StableClubConcentratedLiquidityExecutor.exitAll).
 * Emergency has no batch — sequential emergencyExitLeg only.
 */
import {
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { concentratedLiquidityAdapterAbi } from "@/lib/stable-club/abis";
import { ZERO_ADDRESS, erc721PositionAbi } from "@/lib/stable-club/nft-approval";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { FIVE_POOL_LEG_COUNT } from "@/lib/stable-club/five-pool-strategy";
import type { Phase2aAdapterDeployment } from "@/lib/stable-club/phase2a-deployments";
import { explorerTxUrl } from "@/lib/stable-club/five-pool-deposit";

export const FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS = BigInt(100);
export const FIVE_POOL_EXIT_MIN_FLOOR = BigInt(1);

export type FivePoolExitProgress =
  | "idle"
  | "loading-positions"
  | "awaiting-approval"
  | "awaiting-exit"
  | "confirmed"
  | "partial"
  | "failed";

export type PositionRangeStatus = "in-range" | "out-of-range" | "unknown";

export type FivePoolPosition = {
  legIndex: number;
  poolId: Hex;
  poolLabel: string;
  pairLabel: string;
  protocol: string;
  adapter: Address;
  /** NFT contract to approve / query (local mock = adapter; Base = NPM). */
  nftContract: Address;
  npm: Address;
  tokenA: Address;
  tokenB: Address;
  tokenASymbol: string;
  tokenBSymbol: string;
  positionTokenId: bigint;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
  amountA: bigint;
  amountB: bigint;
  allocationBps: bigint;
  legPermissionId: Hex;
  owner: Address;
  adapterApproved: boolean;
  rangeStatus: PositionRangeStatus;
  explorerNftUrl: string | null;
  protocolExplorerHint: string;
};

export type ExitLegParams = {
  legIndex: number;
  adapter: Address;
  tokenA: Address;
  tokenB: Address;
  positionTokenId: bigint;
  liquidity: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  slippageBps: bigint;
  fullExit: boolean;
};

export type PerLegExitResult = {
  legIndex: number;
  status: "pending" | "approving" | "submitting" | "confirmed" | "failed" | "skipped";
  txHash?: Hex;
  error?: string;
};

export type DirectNpmExitPlan = {
  mode: "npm-owner" | "local-mock-adapter";
  nftContract: Address;
  adapter: Address;
  tokenId: bigint;
  steps: string[];
  decreaseLiquidityCalldata: Hex | null;
  collectCalldata: Hex | null;
  burnCalldata: Hex | null;
  disclaimer: string;
};

export type StrategyLegBinding = {
  poolId: Hex;
  allocationBps: bigint;
  adapter: Address;
  tokenA: Address;
  tokenB: Address;
  legPermissionId: Hex;
  maxLegPerTx: bigint;
  maxLegPerDay: bigint;
};

function catalogueMeta(poolId: Hex): {
  label: string;
  protocol: string;
  tokenASymbol: string;
  tokenBSymbol: string;
} {
  const hit = OFFICIAL_STABLE_CLUB_BASE_POOLS.find(
    (p) => p.poolIdHash.toLowerCase() === poolId.toLowerCase(),
  );
  if (hit) {
    return {
      label: hit.id,
      protocol: hit.protocol,
      tokenASymbol: hit.tokenA.symbol,
      tokenBSymbol: hit.tokenB.symbol,
    };
  }
  return {
    label: `${poolId.slice(0, 10)}…`,
    protocol: "unknown",
    tokenASymbol: "A",
    tokenBSymbol: "B",
  };
}

/** Local mocks mint ERC-721 on the adapter itself; Base uses protocol NPM. */
export function resolveNftContract(
  adapter: Phase2aAdapterDeployment,
  network: string,
): Address {
  if (network === "hardhat-local") return adapter.adapter;
  if (adapter.npm.toLowerCase() === adapter.adapter.toLowerCase()) return adapter.adapter;
  return adapter.npm;
}

export function applyExitSlippageMin(amount: bigint, slippageBps: bigint): bigint {
  if (amount <= BigInt(0)) return FIVE_POOL_EXIT_MIN_FLOOR;
  const bps = slippageBps > BigInt(10_000) ? BigInt(10_000) : slippageBps;
  const reduced = (amount * (BigInt(10_000) - bps)) / BigInt(10_000);
  return reduced > BigInt(0) ? reduced : FIVE_POOL_EXIT_MIN_FLOOR;
}

/**
 * Direct NPM decreaseLiquidity mins — no 1-wei floor.
 * Zero expected amount → zero min (one-sided). Non-zero → floor(amount × (10000 − bps) / 10000).
 */
export function applyNpmExitSlippageMin(amount: bigint, slippageBps: bigint): bigint {
  if (amount <= BigInt(0)) return BigInt(0);
  const bps =
    slippageBps < BigInt(0)
      ? BigInt(0)
      : slippageBps > BigInt(10_000)
        ? BigInt(10_000)
        : slippageBps;
  return (amount * (BigInt(10_000) - bps)) / BigInt(10_000);
}

/** Map leg-ordered A/B minimums into Uniswap/Aerodrome token0/token1 order. */
export function mapLegMinsToToken01(params: {
  tokenA: Address;
  tokenB: Address;
  amountAMin: bigint;
  amountBMin: bigint;
}): { amount0Min: bigint; amount1Min: bigint } {
  const a = getAddress(params.tokenA).toLowerCase();
  const b = getAddress(params.tokenB).toLowerCase();
  if (a < b) {
    return { amount0Min: params.amountAMin, amount1Min: params.amountBMin };
  }
  return { amount0Min: params.amountBMin, amount1Min: params.amountAMin };
}

export function mapAmountsToLegOrder(params: {
  tokenA: Address;
  tokenB: Address;
  token0: Address;
  token1: Address;
  amount0: bigint;
  amount1: bigint;
}): { amountA: bigint; amountB: bigint } {
  const a = getAddress(params.tokenA);
  const b = getAddress(params.tokenB);
  const t0 = getAddress(params.token0);
  const t1 = getAddress(params.token1);
  if (a === t0 && b === t1) return { amountA: params.amount0, amountB: params.amount1 };
  if (a === t1 && b === t0) return { amountA: params.amount1, amountB: params.amount0 };
  throw new Error("Token pair mismatch for position amounts");
}

export function buildFullExitLegParams(params: {
  legIndex: number;
  adapter: Address;
  tokenA: Address;
  tokenB: Address;
  positionTokenId: bigint;
  amountA: bigint;
  amountB: bigint;
  slippageBps: bigint;
}): ExitLegParams {
  return {
    legIndex: params.legIndex,
    adapter: params.adapter,
    tokenA: params.tokenA,
    tokenB: params.tokenB,
    positionTokenId: params.positionTokenId,
    liquidity: BigInt(0),
    amountAMin: applyExitSlippageMin(params.amountA, params.slippageBps),
    amountBMin: applyExitSlippageMin(params.amountB, params.slippageBps),
    slippageBps: params.slippageBps,
    fullExit: true,
  };
}

export function buildSkippedExitLeg(legIndex: number): ExitLegParams {
  return {
    legIndex,
    adapter: ZERO_ADDRESS,
    tokenA: ZERO_ADDRESS,
    tokenB: ZERO_ADDRESS,
    positionTokenId: BigInt(0),
    liquidity: BigInt(0),
    amountAMin: FIVE_POOL_EXIT_MIN_FLOOR,
    amountBMin: FIVE_POOL_EXIT_MIN_FLOOR,
    slippageBps: FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS,
    fullExit: true,
  };
}

/**
 * Build ExitLegParams[5] for atomic exitAll.
 * Missing legs become adapter=0 skips (verified contract/test pattern).
 */
export function buildExitAllLegs(
  positionsByLeg: Map<number, FivePoolPosition>,
  slippageBps: bigint,
): ExitLegParams[] {
  const legs: ExitLegParams[] = [];
  for (let i = 0; i < FIVE_POOL_LEG_COUNT; i++) {
    const pos = positionsByLeg.get(i);
    if (!pos) {
      legs.push(buildSkippedExitLeg(i));
      continue;
    }
    legs.push(
      buildFullExitLegParams({
        legIndex: i,
        adapter: pos.adapter,
        tokenA: pos.tokenA,
        tokenB: pos.tokenB,
        positionTokenId: pos.positionTokenId,
        amountA: pos.amountA,
        amountB: pos.amountB,
        slippageBps,
      }),
    );
  }
  return legs;
}

export function assertWalletOwnsPosition(
  wallet: Address,
  owner: Address,
  tokenId: bigint,
): void {
  if (wallet.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(
      `Ownership mismatch for tokenId ${tokenId.toString()}: wallet ${wallet} ≠ owner ${owner}`,
    );
  }
}

export function nftExplorerUrl(
  chainId: number,
  nftContract: Address,
  tokenId: bigint,
): string | null {
  if (chainId === 8453) {
    return `https://basescan.org/nft/${nftContract}/${tokenId.toString()}`;
  }
  return null;
}

const npmDecreaseLiquidityAbi = [
  {
    type: "function",
    name: "decreaseLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "liquidity", type: "uint128" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
] as const;

export function buildDirectNpmExitPlan(params: {
  network: string;
  position: FivePoolPosition;
  liquidity: bigint;
  deadlineSec: bigint;
  /** Exit slippage already used by this flow; defaults to FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS. */
  slippageBps?: bigint;
}): DirectNpmExitPlan {
  const {
    position,
    liquidity,
    deadlineSec,
    network,
    slippageBps = FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS,
  } = params;
  const disclaimer =
    "Direct protocol exit recovers underlying pool tokens only — not USDC. Exit is not risk-free and may realize impermanent loss, fees, or failed slippage.";

  if (network === "hardhat-local" || position.nftContract.toLowerCase() === position.adapter.toLowerCase()) {
    return {
      mode: "local-mock-adapter",
      nftContract: position.nftContract,
      adapter: position.adapter,
      tokenId: position.positionTokenId,
      steps: [
        "You own the mock CL NFT on the adapter contract (local Hardhat).",
        "Local mocks only allow INDEXLA executor closePosition — use Emergency exit or standard exit in this UI.",
        "On Base mainnet, call the protocol NPM as NFT owner (decreaseLiquidity → collect → burn).",
      ],
      decreaseLiquidityCalldata: null,
      collectCalldata: null,
      burnCalldata: null,
      disclaimer,
    };
  }

  const expectedA = position.amountA;
  const expectedB = position.amountB;
  if (expectedA <= BigInt(0) && expectedB <= BigInt(0)) {
    return {
      mode: "npm-owner",
      nftContract: position.npm,
      adapter: position.adapter,
      tokenId: position.positionTokenId,
      steps: [
        "Direct NPM exit unavailable: expected token amounts are zero or unavailable.",
        "Refresh position amounts, then retry — or exit via INDEXLA when amounts are known.",
      ],
      decreaseLiquidityCalldata: null,
      collectCalldata: null,
      burnCalldata: null,
      disclaimer,
    };
  }

  const { amount0Min, amount1Min } = mapLegMinsToToken01({
    tokenA: position.tokenA,
    tokenB: position.tokenB,
    amountAMin: applyNpmExitSlippageMin(expectedA, slippageBps),
    amountBMin: applyNpmExitSlippageMin(expectedB, slippageBps),
  });

  const decreaseLiquidityCalldata = encodeFunctionData({
    abi: npmDecreaseLiquidityAbi,
    functionName: "decreaseLiquidity",
    args: [
      {
        tokenId: position.positionTokenId,
        liquidity: liquidity > BigInt(0) ? liquidity : BigInt(1),
        amount0Min,
        amount1Min,
        deadline: deadlineSec,
      },
    ],
  });

  const collectCalldata = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "collect",
        stateMutability: "nonpayable",
        inputs: [
          {
            name: "params",
            type: "tuple",
            components: [
              { name: "tokenId", type: "uint256" },
              { name: "recipient", type: "address" },
              { name: "amount0Max", type: "uint128" },
              { name: "amount1Max", type: "uint128" },
            ],
          },
        ],
        outputs: [
          { name: "amount0", type: "uint256" },
          { name: "amount1", type: "uint256" },
        ],
      },
    ] as const,
    functionName: "collect",
    args: [
      {
        tokenId: position.positionTokenId,
        recipient: position.owner,
        amount0Max: BigInt("0xffffffffffffffffffffffffffffffff"),
        amount1Max: BigInt("0xffffffffffffffffffffffffffffffff"),
      },
    ],
  });

  const burnCalldata = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "burn",
        stateMutability: "nonpayable",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [],
      },
    ] as const,
    functionName: "burn",
    args: [position.positionTokenId],
  });

  return {
    mode: "npm-owner",
    nftContract: position.npm,
    adapter: position.adapter,
    tokenId: position.positionTokenId,
    steps: [
      `As NFT owner, call NPM ${position.npm} decreaseLiquidity for tokenId ${position.positionTokenId.toString()}.`,
      "Call collect with recipient = your wallet and max uint128 amounts.",
      "Call burn(tokenId) after liquidity is zero.",
      "Does not require INDEXLA, Permit2, or strategy permissions.",
    ],
    decreaseLiquidityCalldata,
    collectCalldata,
    burnCalldata,
    disclaimer,
  };
}

/**
 * @deprecated SC-F04: token-pair-only matching is unsafe on shared NPMs.
 * Use {@link matchExactPoolMintTokenId} which requires fee/tickSpacing + factory→pool.
 */
export function matchMintTokenId(params: {
  candidates: readonly bigint[];
  user: Address;
  expectedTokenA: Address;
  expectedTokenB: Address;
  readOwner: (tokenId: bigint) => Promise<Address>;
  readTokens: (tokenId: bigint) => Promise<readonly [Address, Address]>;
  readAmounts: (tokenId: bigint) => Promise<readonly [bigint, bigint]>;
}): Promise<bigint | null> {
  const { candidates, user, expectedTokenA, expectedTokenB, readOwner, readTokens, readAmounts } =
    params;
  const e0 =
    expectedTokenA.toLowerCase() < expectedTokenB.toLowerCase()
      ? expectedTokenA
      : expectedTokenB;
  const e1 =
    expectedTokenA.toLowerCase() < expectedTokenB.toLowerCase()
      ? expectedTokenB
      : expectedTokenA;

  return (async () => {
    for (let i = candidates.length - 1; i >= 0; i--) {
      const tokenId = candidates[i]!;
      try {
        const owner = await readOwner(tokenId);
        if (owner.toLowerCase() !== user.toLowerCase()) continue;
        const [t0, t1] = await readTokens(tokenId);
        if (t0.toLowerCase() !== e0.toLowerCase() || t1.toLowerCase() !== e1.toLowerCase()) {
          continue;
        }
        const [a0, a1] = await readAmounts(tokenId);
        if (a0 + a1 === BigInt(0)) continue;
        return tokenId;
      } catch {
        continue;
      }
    }
    return null;
  })();
}

/** SC-F04: Base RPC-friendly eth_getLogs chunk size. */
export const POSITION_DISCOVERY_LOG_CHUNK_SIZE = BigInt(2_000);
/** SC-F04: local Hardhat never uses block 0. */
export const LOCAL_POSITION_DISCOVERY_FROM_BLOCK = BigInt(1);

export function resolvePositionDiscoveryFromBlock(params: {
  network: string;
  chainId: number;
  discoveryStartBlock?: number | string | null;
}): bigint {
  const isVerifiedLocal = params.network === "hardhat-local" && params.chainId === 31337;
  if (isVerifiedLocal) {
    if (params.discoveryStartBlock == null || params.discoveryStartBlock === "") {
      return LOCAL_POSITION_DISCOVERY_FROM_BLOCK;
    }
    const localStart = BigInt(params.discoveryStartBlock);
    if (localStart <= BigInt(0)) {
      throw new Error("Local discoveryStartBlock must be greater than 0");
    }
    return localStart;
  }
  if (params.discoveryStartBlock == null || params.discoveryStartBlock === "") {
    throw new Error(
      "Missing trusted discoveryStartBlock for non-local position discovery — refusing fromBlock 0",
    );
  }
  const start = BigInt(params.discoveryStartBlock);
  if (start <= BigInt(0)) {
    throw new Error("discoveryStartBlock must be greater than 0 — refusing fromBlock 0");
  }
  return start;
}

export function buildPositionDiscoveryBlockRanges(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint = POSITION_DISCOVERY_LOG_CHUNK_SIZE,
): { fromBlock: bigint; toBlock: bigint }[] {
  if (fromBlock <= BigInt(0)) {
    throw new Error("Position discovery fromBlock must be greater than 0");
  }
  if (chunkSize <= BigInt(0)) {
    throw new Error("Position discovery chunk size must be greater than 0");
  }
  if (fromBlock > toBlock) return [];
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end =
      cursor + chunkSize - BigInt(1) > toBlock ? toBlock : cursor + chunkSize - BigInt(1);
    ranges.push({ fromBlock: cursor, toBlock: end });
    cursor = end + BigInt(1);
  }
  return ranges;
}

/** Catalogue feeBps (e.g. 5) → Uniswap V3 fee tier (500). */
export function uniswapV3FeeFromCatalogueBps(feeBps: number): number {
  return feeBps * 100;
}

export type NpmPositionIdentity = {
  token0: Address;
  token1: Address;
  /** Uni V3 fee tier (e.g. 500). */
  fee?: number;
  /** Aerodrome Slipstream tickSpacing. */
  tickSpacing?: number;
  liquidity: bigint;
};

/**
 * SC-F04: bind mint tokenId only with owner + exact tokens + fee/tickSpacing + factory→pool.
 * Token-pair-only matching is rejected by requiring pool address equality.
 */
export async function matchExactPoolMintTokenId(params: {
  candidates: readonly bigint[];
  user: Address;
  expectedTokenA: Address;
  expectedTokenB: Address;
  protocol: string;
  expectedPool: Address;
  factory: Address;
  expectedFee?: number;
  expectedTickSpacing?: number;
  claimedTokenIds: ReadonlySet<string>;
  readOwner: (tokenId: bigint) => Promise<Address>;
  readNpmPosition: (tokenId: bigint) => Promise<NpmPositionIdentity>;
  resolveFactoryPool: (args: {
    token0: Address;
    token1: Address;
    fee?: number;
    tickSpacing?: number;
  }) => Promise<Address>;
  readAmounts: (tokenId: bigint) => Promise<readonly [bigint, bigint]>;
}): Promise<bigint | null> {
  const e0 =
    params.expectedTokenA.toLowerCase() < params.expectedTokenB.toLowerCase()
      ? getAddress(params.expectedTokenA)
      : getAddress(params.expectedTokenB);
  const e1 =
    params.expectedTokenA.toLowerCase() < params.expectedTokenB.toLowerCase()
      ? getAddress(params.expectedTokenB)
      : getAddress(params.expectedTokenA);
  const expectedPool = getAddress(params.expectedPool);
  const isUni = params.protocol === "uniswap-v3" || params.protocol === "uniswap";
  const isAero =
    params.protocol === "aerodrome-slipstream" || params.protocol === "aerodrome";

  for (let i = params.candidates.length - 1; i >= 0; i--) {
    const tokenId = params.candidates[i]!;
    const claimKey = tokenId.toString();
    if (params.claimedTokenIds.has(claimKey)) continue;
    try {
      const owner = await params.readOwner(tokenId);
      if (owner.toLowerCase() !== params.user.toLowerCase()) continue;

      const meta = await params.readNpmPosition(tokenId);
      if (
        getAddress(meta.token0) !== e0 ||
        getAddress(meta.token1) !== e1
      ) {
        continue;
      }

      if (isUni) {
        if (params.expectedFee == null || meta.fee == null) continue;
        if (Number(meta.fee) !== Number(params.expectedFee)) continue;
        const resolved = await params.resolveFactoryPool({
          token0: meta.token0,
          token1: meta.token1,
          fee: params.expectedFee,
        });
        if (getAddress(resolved) !== expectedPool) continue;
      } else if (isAero) {
        if (params.expectedTickSpacing == null || meta.tickSpacing == null) continue;
        if (Number(meta.tickSpacing) !== Number(params.expectedTickSpacing)) continue;
        const resolved = await params.resolveFactoryPool({
          token0: meta.token0,
          token1: meta.token1,
          tickSpacing: params.expectedTickSpacing,
        });
        if (getAddress(resolved) !== expectedPool) continue;
      } else {
        continue;
      }

      const [a0, a1] = await params.readAmounts(tokenId);
      if (a0 + a1 === BigInt(0) && meta.liquidity === BigInt(0)) continue;
      return tokenId;
    } catch {
      continue;
    }
  }
  return null;
}

export function cataloguePoolForLegPoolId(poolId: Hex) {
  return OFFICIAL_STABLE_CLUB_BASE_POOLS.find(
    (p) => p.poolIdHash.toLowerCase() === poolId.toLowerCase(),
  );
}

/**
 * Trusted exact-pool binding inputs from the official catalogue.
 * Returns null when pool identity cannot be proven (missing catalogue / poolAddress).
 */
export function exactPoolBindingExpectations(poolId: Hex): {
  protocol: string;
  expectedPool: Address;
  factory: Address;
  expectedFee?: number;
  expectedTickSpacing?: number;
} | null {
  const pool = cataloguePoolForLegPoolId(poolId);
  if (!pool || pool.poolAddress == null || pool.poolAddress === ZERO_ADDRESS) {
    return null;
  }
  if (pool.feeOrTick.kind === "fee") {
    return {
      protocol: pool.protocol,
      expectedPool: getAddress(pool.poolAddress),
      factory: getAddress(pool.infrastructure.factory),
      expectedFee: uniswapV3FeeFromCatalogueBps(pool.feeOrTick.feeBps),
    };
  }
  return {
    protocol: pool.protocol,
    expectedPool: getAddress(pool.poolAddress),
    factory: getAddress(pool.infrastructure.factory),
    expectedTickSpacing: pool.feeOrTick.tickSpacing,
  };
}

export const uniV3NpmPositionsAbi = [
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

export const aeroNpmPositionsAbi = [
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "tickSpacing", type: "int24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

export const uniV3FactoryGetPoolAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

export const aeroFactoryGetPoolAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "tickSpacing", type: "int24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

export function collectTokenIdsFromTransferLogs(
  logs: readonly { args?: { tokenId?: bigint } | null }[],
): bigint[] {
  const ids: bigint[] = [];
  for (const log of logs) {
    const tokenId = log.args?.tokenId;
    if (tokenId != null) ids.push(tokenId);
  }
  return ids;
}

export function toFivePoolPosition(params: {
  legIndex: number;
  leg: StrategyLegBinding;
  adapterMeta: Phase2aAdapterDeployment;
  network: string;
  chainId: number;
  tokenId: bigint;
  owner: Address;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
  adapterApproved: boolean;
  rangeStatus?: PositionRangeStatus;
}): FivePoolPosition {
  const meta = catalogueMeta(params.leg.poolId);
  const mapped = mapAmountsToLegOrder({
    tokenA: params.leg.tokenA,
    tokenB: params.leg.tokenB,
    token0:
      params.leg.tokenA.toLowerCase() < params.leg.tokenB.toLowerCase()
        ? params.leg.tokenA
        : params.leg.tokenB,
    token1:
      params.leg.tokenA.toLowerCase() < params.leg.tokenB.toLowerCase()
        ? params.leg.tokenB
        : params.leg.tokenA,
    amount0: params.amount0,
    amount1: params.amount1,
  });
  // Prefer amounts already in token0/1 order from adapter; remapped above for A/B.
  const nftContract = resolveNftContract(params.adapterMeta, params.network);
  return {
    legIndex: params.legIndex,
    poolId: params.leg.poolId,
    poolLabel: meta.label,
    pairLabel: `${meta.tokenASymbol}/${meta.tokenBSymbol}`,
    protocol: params.adapterMeta.protocol || meta.protocol,
    adapter: params.leg.adapter,
    nftContract,
    npm: params.adapterMeta.npm,
    tokenA: params.leg.tokenA,
    tokenB: params.leg.tokenB,
    tokenASymbol: meta.tokenASymbol,
    tokenBSymbol: meta.tokenBSymbol,
    positionTokenId: params.tokenId,
    liquidity: params.liquidity,
    amount0: params.amount0,
    amount1: params.amount1,
    amountA: mapped.amountA,
    amountB: mapped.amountB,
    allocationBps: params.leg.allocationBps,
    legPermissionId: params.leg.legPermissionId,
    owner: params.owner,
    adapterApproved: params.adapterApproved,
    rangeStatus: params.rangeStatus ?? "unknown",
    explorerNftUrl: nftExplorerUrl(params.chainId, nftContract, params.tokenId),
    protocolExplorerHint:
      params.network === "hardhat-local"
        ? "Local mock NFT (adapter ERC-721)"
        : `${meta.protocol} NPM`,
  };
}

export { explorerTxUrl, concentratedLiquidityAdapterAbi, erc721PositionAbi };
