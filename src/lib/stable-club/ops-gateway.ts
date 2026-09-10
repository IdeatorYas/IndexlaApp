/**
 * StableClubOpsGateway — feature gate + EIP-5792 progressive enhancement helpers.
 * Live Base stays fail-closed until address pin + explicit withdraw/deposit flags.
 * Withdraw and deposit are independent so enabling withdraw cannot route deposits
 * into a blocked registry/adapter path.
 */
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
  type WalletClient,
} from "viem";
import type { StableClubPhase2aDeployments } from "@/lib/stable-club/phase2a-deployments";

/** ERC721 setApprovalForAll selector — must never be confused with ERC20 approve 0x095ea7b3. */
export const SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465" as const;

export const OPS_GATEWAY_MAX_PERMIT2_TTL_SEC = 30 * 60;

export type OpsGatewayDeployments = {
  network?: string;
  opsGateway?: Address | string | null;
  /** Deposit-capable gateway (matched registry+executor+adapters). Optional until cutover. */
  opsGatewayDeposit?: Address | string | null;
  features?: {
    exitAllToUsdc?: boolean;
    exitPercentToUsdc?: boolean;
    /**
     * @deprecated Ignored for routing. Use opsGatewayWithdraw / opsGatewayDeposit.
     * Kept so old manifests do not accidentally enable both paths.
     */
    opsGateway?: boolean;
    /** NPM exitPercentToUsdc via gateway — enable after Timelock unpause + verify. */
    opsGatewayWithdraw?: boolean;
    /** depositFirst/depositAgain — enable only after matched deposit stack + fork proof. */
    opsGatewayDeposit?: boolean;
  };
} | null;

function isNonZeroAddress(raw: unknown): raw is Address {
  if (!raw || typeof raw !== "string" || !isAddress(raw)) return false;
  try {
    return getAddress(raw) !== "0x0000000000000000000000000000000000000000";
  } catch {
    return false;
  }
}

/** True when either gateway path is address-pinned and explicitly flagged. */
export function isOpsGatewayAvailable(deployments: OpsGatewayDeployments): boolean {
  return (
    isOpsGatewayWithdrawAvailable(deployments) || isOpsGatewayDepositAvailable(deployments)
  );
}

export function isOpsGatewayWithdrawAvailable(
  deployments: OpsGatewayDeployments,
): boolean {
  if (!deployments?.features?.opsGatewayWithdraw) return false;
  return isNonZeroAddress(deployments.opsGateway);
}

export function isOpsGatewayDepositAvailable(
  deployments: OpsGatewayDeployments,
): boolean {
  if (!deployments?.features?.opsGatewayDeposit) return false;
  const depositAddr = deployments.opsGatewayDeposit ?? deployments.opsGateway;
  return isNonZeroAddress(depositAddr);
}

export function resolveOpsGatewayAddress(
  deployments: OpsGatewayDeployments,
): Address | null {
  if (!isOpsGatewayWithdrawAvailable(deployments)) return null;
  return getAddress(deployments!.opsGateway as Address);
}

export function resolveOpsGatewayDepositAddress(
  deployments: OpsGatewayDeployments,
): Address | null {
  if (!isOpsGatewayDepositAvailable(deployments)) return null;
  const raw = (deployments!.opsGatewayDeposit ?? deployments!.opsGateway) as Address;
  return getAddress(raw);
}

/**
 * Honest prompt inventory once gateway is live on Base.
 * Cold withdraw on sequential EOAs is 4 unless EIP-5792 packs operator grants.
 */
export const OPS_GATEWAY_PROMPT_INVENTORY = {
  firstDeposit: 2,
  laterDepositWarm: 1,
  coldWithdrawSequential: 4,
  coldWithdrawAtomicBatch: 1,
  warmWithdraw: 1,
} as const;

export function coldWithdrawPromptClaim(params: {
  atomicBatchSupported: boolean;
}): { prompts: number; mayClaimLe3: boolean; copy: string } {
  if (params.atomicBatchSupported) {
    return {
      prompts: OPS_GATEWAY_PROMPT_INVENTORY.coldWithdrawAtomicBatch,
      mayClaimLe3: true,
      copy: "One batched confirmation (operator grants + exit to USDC).",
    };
  }
  return {
    prompts: OPS_GATEWAY_PROMPT_INVENTORY.coldWithdrawSequential,
    mayClaimLe3: false,
    copy:
      "One-time setup needs 3 NFT operator grants + 1 exit (4 confirmations). After that, withdraw is 1 confirmation. This wallet does not advertise ≤3 for first cold withdraw.",
  };
}

export type WalletAtomicBatchCapability = {
  atomicBatchSupported: boolean;
  source: "wallet_getCapabilities" | "unavailable" | "error";
};

/**
 * Progressive enhancement probe — never required for correctness.
 * MetaMask/WC often sequentialize even when capabilities claim support.
 */
export async function probeAtomicBatchCapability(params: {
  provider: EIP1193Provider;
  chainIdHex: Hex;
  account: Address;
}): Promise<WalletAtomicBatchCapability> {
  try {
    const caps = (await params.provider.request({
      method: "wallet_getCapabilities",
      params: [params.account, [params.chainIdHex]],
    })) as Record<string, { atomicBatch?: { supported?: boolean }; atomic?: { status?: string } }>;
    const chainCaps = caps?.[params.chainIdHex.toLowerCase()] ?? caps?.[params.chainIdHex];
    const supported =
      chainCaps?.atomicBatch?.supported === true ||
      chainCaps?.atomic?.status === "supported" ||
      chainCaps?.atomic?.status === "ready";
    return {
      atomicBatchSupported: Boolean(supported),
      source: "wallet_getCapabilities",
    };
  } catch {
    return { atomicBatchSupported: false, source: "error" };
  }
}

export const erc721SetApprovalForAllAbi = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const opsGatewayAbi = [
  {
    type: "function",
    name: "depositFirst",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "strategy",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "chainId", type: "uint256" },
          { name: "depositToken", type: "address" },
          { name: "allowedActions", type: "uint256" },
          { name: "maxTotalPerTx", type: "uint256" },
          { name: "maxTotalPerDay", type: "uint256" },
          { name: "maxSlippageBps", type: "uint256" },
          { name: "minTimeBetweenExecutions", type: "uint256" },
          { name: "maxExecutionsPerDay", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
          { name: "revoked", type: "bool" },
          { name: "paused", type: "bool" },
        ],
      },
      {
        name: "legPermissions",
        type: "tuple[5]",
        components: [
          { name: "user", type: "address" },
          { name: "chainId", type: "uint256" },
          { name: "poolId", type: "bytes32" },
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
          { name: "allowedActions", type: "uint256" },
          { name: "maxAmountPerTx", type: "uint256" },
          { name: "maxAmountPerDay", type: "uint256" },
          { name: "maxSlippageBps", type: "uint256" },
          { name: "minTimeBetweenExecutions", type: "uint256" },
          { name: "maxExecutionsPerDay", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
          { name: "revoked", type: "bool" },
          { name: "paused", type: "bool" },
        ],
      },
      {
        name: "legs",
        type: "tuple[5]",
        components: [
          { name: "poolId", type: "bytes32" },
          { name: "allocationBps", type: "uint256" },
          { name: "adapter", type: "address" },
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
          { name: "legPermissionId", type: "bytes32" },
          { name: "maxLegPerTx", type: "uint256" },
          { name: "maxLegPerDay", type: "uint256" },
        ],
      },
      { name: "registerSignature", type: "bytes" },
      {
        name: "permitSingle",
        type: "tuple",
        components: [
          {
            name: "details",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint160" },
              { name: "expiration", type: "uint48" },
              { name: "nonce", type: "uint48" },
            ],
          },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
      },
      { name: "permitSignature", type: "bytes" },
      { name: "strategyId", type: "bytes32" },
      { name: "executionNonce", type: "uint256" },
      { name: "grossUsdc", type: "uint256" },
      { name: "poolIds", type: "bytes32[5]" },
      { name: "depositDeadline", type: "uint256" },
      {
        name: "depositLegs",
        type: "tuple[5]",
        components: [
          { name: "legIndex", type: "uint8" },
          { name: "adapter", type: "address" },
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "retainUsdc", type: "uint256" },
          {
            name: "swaps",
            type: "tuple[2]",
            components: [
              { name: "routeId", type: "bytes32" },
              { name: "grossUsdcIn", type: "uint256" },
              { name: "minOut", type: "uint256" },
              { name: "quotedOut", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          { name: "swapCount", type: "uint8" },
          { name: "amountAMin", type: "uint256" },
          { name: "amountBMin", type: "uint256" },
          { name: "slippageBps", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "depositAgain",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permitSingle",
        type: "tuple",
        components: [
          {
            name: "details",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint160" },
              { name: "expiration", type: "uint48" },
              { name: "nonce", type: "uint48" },
            ],
          },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
      },
      { name: "permitSignature", type: "bytes" },
      { name: "strategyId", type: "bytes32" },
      { name: "executionNonce", type: "uint256" },
      { name: "grossUsdc", type: "uint256" },
      { name: "poolIds", type: "bytes32[5]" },
      { name: "depositDeadline", type: "uint256" },
      {
        name: "depositLegs",
        type: "tuple[5]",
        components: [
          { name: "legIndex", type: "uint8" },
          { name: "adapter", type: "address" },
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "retainUsdc", type: "uint256" },
          {
            name: "swaps",
            type: "tuple[2]",
            components: [
              { name: "routeId", type: "bytes32" },
              { name: "grossUsdcIn", type: "uint256" },
              { name: "minOut", type: "uint256" },
              { name: "quotedOut", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          { name: "swapCount", type: "uint8" },
          { name: "amountAMin", type: "uint256" },
          { name: "amountBMin", type: "uint256" },
          { name: "slippageBps", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "exitPercentToUsdc",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "exitLegs",
        type: "tuple[]",
        components: [
          { name: "npm", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "liquidity", type: "uint128" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "burnIfEmpty", type: "bool" },
        ],
      },
      {
        name: "swaps",
        type: "tuple[]",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
      { name: "minUsdcOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "usdcOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "registerConsentNonce",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type NpmExitLegInput = {
  npm: Address;
  tokenId: bigint;
  liquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  burnIfEmpty: boolean;
};

export type GatewayExitSwapInput = {
  tokenIn: Address;
  fee: number;
  amountIn: bigint;
  amountOutMinimum: bigint;
};

/** Unique NPM addresses from open positions (≤3 on Base). */
export function uniqueNpmAddresses(
  positions: ReadonlyArray<{ npm: Address }>,
): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const p of positions) {
    const key = p.npm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(getAddress(p.npm));
  }
  return out;
}

export function encodeSetApprovalForAllCall(params: {
  npm: Address;
  operator: Address;
  approved: boolean;
}): { to: Address; data: Hex } {
  const data = encodeFunctionData({
    abi: erc721SetApprovalForAllAbi,
    functionName: "setApprovalForAll",
    args: [params.operator, params.approved],
  });
  if (!data.toLowerCase().startsWith(SET_APPROVAL_FOR_ALL_SELECTOR)) {
    throw new Error("Refusing encode: expected setApprovalForAll selector 0xa22cb465");
  }
  return { to: getAddress(params.npm), data };
}

export function encodeGatewayExitPercentToUsdcCall(params: {
  gateway: Address;
  exitLegs: NpmExitLegInput[];
  swaps: GatewayExitSwapInput[];
  minUsdcOut: bigint;
  deadline: bigint;
}): { to: Address; data: Hex } {
  const data = encodeFunctionData({
    abi: opsGatewayAbi,
    functionName: "exitPercentToUsdc",
    args: [
      params.exitLegs.map((l) => ({
        npm: l.npm,
        tokenId: l.tokenId,
        liquidity: l.liquidity,
        amount0Min: l.amount0Min,
        amount1Min: l.amount1Min,
        burnIfEmpty: l.burnIfEmpty,
      })),
      params.swaps.map((s) => ({
        tokenIn: s.tokenIn,
        fee: s.fee,
        amountIn: s.amountIn,
        amountOutMinimum: s.amountOutMinimum,
      })),
      params.minUsdcOut,
      params.deadline,
    ],
  });
  return { to: getAddress(params.gateway), data };
}

/**
 * Try EIP-5792 wallet_sendCalls; return null if unsupported so caller can sequentialize.
 */
export async function tryWalletSendCalls(params: {
  provider: EIP1193Provider;
  from: Address;
  chainIdHex: Hex;
  calls: Array<{ to: Address; data: Hex; value?: Hex }>;
}): Promise<Hex | null> {
  try {
    const id = (await params.provider.request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          from: params.from,
          chainId: params.chainIdHex,
          atomicRequired: true,
          calls: params.calls.map((c) => ({
            to: c.to,
            data: c.data,
            value: c.value ?? "0x0",
          })),
        },
      ],
    })) as Hex | { id: Hex };
    if (typeof id === "string") return id as Hex;
    if (id && typeof id === "object" && "id" in id) return id.id;
    return null;
  } catch {
    return null;
  }
}

export async function ensureNpmOperatorGrants(params: {
  walletClient: Pick<WalletClient, "writeContract">;
  owner: Address;
  gateway: Address;
  npms: Address[];
  isApprovedForAll: (npm: Address) => Promise<boolean>;
}): Promise<Hex[]> {
  const hashes: Hex[] = [];
  for (const npm of params.npms) {
    if (await params.isApprovedForAll(npm)) continue;
    const hash = await params.walletClient.writeContract({
      address: npm,
      abi: erc721SetApprovalForAllAbi,
      functionName: "setApprovalForAll",
      args: [params.gateway, true],
      account: params.owner,
      chain: null,
    });
    hashes.push(hash);
  }
  return hashes;
}

/** Attach optional opsGateway withdraw/deposit flags without breaking attestation keys. */
export function withOptionalOpsGateway(
  deployments: StableClubPhase2aDeployments,
  opsGateway: Address | null,
  enabled: boolean,
): StableClubPhase2aDeployments & { opsGateway?: Address } {
  // Legacy helper: `enabled` maps to withdraw-only so deposits stay fail-closed.
  if (!opsGateway || !enabled) {
    return {
      ...deployments,
      features: {
        ...deployments.features,
        opsGateway: false,
        opsGatewayWithdraw: false,
        opsGatewayDeposit: false,
      },
    };
  }
  return {
    ...deployments,
    opsGateway,
    features: {
      ...deployments.features,
      opsGateway: false,
      opsGatewayWithdraw: true,
      opsGatewayDeposit: false,
    },
  };
}
