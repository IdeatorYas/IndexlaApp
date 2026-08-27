import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256 } from "viem";
import { computeStableClubPermissionId } from "@/lib/stable-club/permission-id";

describe("computeStableClubPermissionId", () => {
  it("derives stable strategy permission id without registration nonce", () => {
    const user = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const poolId = keccak256(
      encodeAbiParameters([{ type: "string" }], ["INDEXLA_STABLE_CLUB_TEST_POOL_BASE_INTERNAL_V1"]),
    );
    const tokenA = "0x00000000000000000000000000000000000000a1";
    const tokenB = "0x00000000000000000000000000000000000000b2";

    const first = computeStableClubPermissionId({
      user,
      chainId: 8453,
      poolId,
      tokenA,
      tokenB,
    });
    const second = computeStableClubPermissionId({
      user,
      chainId: 8453,
      poolId,
      tokenA,
      tokenB,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });
});
