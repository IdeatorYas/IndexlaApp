/** Stable strategy permission — reusable across many executions. */
export type StableClubPermissionAction =
  | "deposit-and-add-liquidity"
  | "swap"
  | "add-liquidity"
  | "remove-liquidity"
  | "withdraw-all"
  | "pause-automation"
  | "revoke-permission"
  | "emergency-exit";

export type StableClubPermissionScope = {
  user: `0x${string}`;
  chainId: number;
  poolId: `0x${string}`;
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
  allowedActions: StableClubPermissionAction[];
  maxAmountPerTx: bigint;
  maxAmountPerDay: bigint;
  maxSlippageBps: number;
  minTimeBetweenExecutionsSec: number;
  maxExecutionsPerDay: number;
  expiresAt: number;
};

export const STABLE_CLUB_PERMISSION_ACTION_BITS: Record<
  StableClubPermissionAction,
  number
> = {
  "deposit-and-add-liquidity": 1 << 0,
  swap: 1 << 1,
  "add-liquidity": 1 << 2,
  "remove-liquidity": 1 << 3,
  "withdraw-all": 1 << 4,
  "pause-automation": 1 << 5,
  "revoke-permission": 1 << 6,
  "emergency-exit": 1 << 7,
};

export function encodeAllowedActions(
  actions: StableClubPermissionAction[],
): number {
  return actions.reduce(
    (mask, action) => mask | STABLE_CLUB_PERMISSION_ACTION_BITS[action],
    0,
  );
}

export const STABLE_CLUB_STEP1_DEFAULT_ACTIONS: StableClubPermissionAction[] = [
  "deposit-and-add-liquidity",
  "remove-liquidity",
  "withdraw-all",
  "pause-automation",
  "revoke-permission",
  "emergency-exit",
];

export function buildDefaultPermissionScope(input: {
  user: `0x${string}`;
  chainId: number;
  poolId: `0x${string}`;
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
}): StableClubPermissionScope {
  return {
    ...input,
    allowedActions: STABLE_CLUB_STEP1_DEFAULT_ACTIONS,
    maxAmountPerTx: BigInt(5_000_000_000),
    maxAmountPerDay: BigInt(20_000_000_000),
    maxSlippageBps: 500,
    minTimeBetweenExecutionsSec: 0,
    maxExecutionsPerDay: 50,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };
}

export function toOnChainPermission(scope: StableClubPermissionScope) {
  return {
    user: scope.user,
    chainId: BigInt(scope.chainId),
    poolId: scope.poolId,
    tokenA: scope.tokenA,
    tokenB: scope.tokenB,
    allowedActions: BigInt(encodeAllowedActions(scope.allowedActions)),
    maxAmountPerTx: scope.maxAmountPerTx,
    maxAmountPerDay: scope.maxAmountPerDay,
    maxSlippageBps: BigInt(scope.maxSlippageBps),
    minTimeBetweenExecutions: BigInt(scope.minTimeBetweenExecutionsSec),
    maxExecutionsPerDay: BigInt(scope.maxExecutionsPerDay),
    expiresAt: BigInt(scope.expiresAt),
    revoked: false,
    paused: false,
  } as const;
}
