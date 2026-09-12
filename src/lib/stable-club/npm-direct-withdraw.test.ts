import { describe, expect, it } from "vitest";
import {
  APPROVE_SELECTOR,
  assertAllowedNpm,
  assertNotApproveCalldata,
  buildNpmWithdrawMulticallCalls,
  ALLOWED_BASE_NPM_ADDRESSES,
} from "@/lib/stable-club/npm-direct-withdraw";

describe("npm-direct-withdraw", () => {
  it("allowlists only Uni/Aero NPMs", () => {
    expect(assertAllowedNpm(ALLOWED_BASE_NPM_ADDRESSES[0]!)).toBe(
      ALLOWED_BASE_NPM_ADDRESSES[0],
    );
    expect(() =>
      assertAllowedNpm("0x488f0680ff28908F49CC85C05b9E4813e657FcD2"),
    ).toThrow(/allowlisted/);
  });

  it("rejects approve selector", () => {
    expect(() => assertNotApproveCalldata(`${APPROVE_SELECTOR}${"00".repeat(64)}` as `0x${string}`)).toThrow(
      /approve/,
    );
  });

  it("builds multicall without approve selectors", () => {
    const { calls, multicallData } = buildNpmWithdrawMulticallCalls({
      tokenId: BigInt(42),
      liquidity: BigInt(1000),
      amount0Min: BigInt(1),
      amount1Min: BigInt(2),
      deadline: BigInt(1_700_000_000),
      recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      burnAfter: true,
    });
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      expect(c.slice(0, 10).toLowerCase()).not.toBe(APPROVE_SELECTOR);
    }
    expect(multicallData.slice(0, 10).toLowerCase()).not.toBe(APPROVE_SELECTOR);
    expect(multicallData.startsWith("0xac9650d8")).toBe(true); // multicall(bytes[])
  });

  it("can split decrease/collect/burn into separate payloads", () => {
    const { stepPayloads } = buildNpmWithdrawMulticallCalls({
      tokenId: BigInt(42),
      liquidity: BigInt(1000),
      amount0Min: BigInt(0),
      amount1Min: BigInt(0),
      deadline: BigInt(1_700_000_000),
      recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      burnAfter: true,
      splitSteps: true,
    });
    expect(stepPayloads).toHaveLength(3);
  });
});
