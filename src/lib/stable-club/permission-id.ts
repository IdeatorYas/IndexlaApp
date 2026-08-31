import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";

/** Legacy unscoped id — unchanged. Used by harvest / deposit / existing registrations. */
export function computeStableClubPermissionId(input: {
  user: Address;
  chainId: number;
  poolId: Hex;
  tokenA: Address;
  tokenB: Address;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
      ],
      [input.user, BigInt(input.chainId), input.poolId, input.tokenA, input.tokenB],
    ),
  );
}

/**
 * On-chain scope salts for `permissionIdForScoped` / `registerScopedPermission`.
 * Must match Solidity `keccak256("INDEXLA_PERMISSION_SCOPE_…")`.
 */
export const PERMISSION_SCOPE_COMPOUND = keccak256(
  toBytes("INDEXLA_PERMISSION_SCOPE_COMPOUND"),
) as Hex;
export const PERMISSION_SCOPE_HARVEST = keccak256(
  toBytes("INDEXLA_PERMISSION_SCOPE_HARVEST"),
) as Hex;
export const PERMISSION_SCOPE_REBALANCE = keccak256(
  toBytes("INDEXLA_PERMISSION_SCOPE_REBALANCE"),
) as Hex;

/** Scoped id — 6-field encode; never collides with legacy 5-field ids. */
export function computeStableClubScopedPermissionId(input: {
  user: Address;
  chainId: number;
  poolId: Hex;
  tokenA: Address;
  tokenB: Address;
  scope: Hex;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
      ],
      [
        input.user,
        BigInt(input.chainId),
        input.poolId,
        input.tokenA,
        input.tokenB,
        input.scope,
      ],
    ),
  );
}
