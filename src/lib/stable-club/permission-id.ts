import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

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
