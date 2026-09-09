import { describe, expect, it } from "vitest";
import {
  RECOVER_APPROVE_GAS_FLOOR,
  RECOVER_APPROVE_OOG_USER_MESSAGE,
  RECOVER_SWAP_GAS_FLOOR,
  applyRecoverGasBuffer,
  isWalletGasEstimateStale,
} from "@/lib/stable-club/recover-swap-gas";

describe("recover-swap-gas", () => {
  it("buffers warm-slot approve estimate above cold-slot OOG limit 43216", () => {
    const buffered = applyRecoverGasBuffer({
      estimateGas: BigInt(43_216),
      floor: RECOVER_APPROVE_GAS_FLOOR,
    });
    expect(buffered).toBeGreaterThan(BigInt(60_761));
    expect(buffered).toBeGreaterThanOrEqual(RECOVER_APPROVE_GAS_FLOOR);
  });

  it("buffers swap estimate above live used gas", () => {
    const buffered = applyRecoverGasBuffer({
      estimateGas: BigInt(135_948),
      floor: RECOVER_SWAP_GAS_FLOOR,
    });
    expect(buffered).toBeGreaterThan(BigInt(126_724));
    expect(buffered).toBeGreaterThanOrEqual(RECOVER_SWAP_GAS_FLOOR);
  });

  it("detects stale wallet estimate vs fresh HTTP estimate", () => {
    expect(
      isWalletGasEstimateStale({
        walletEstimate: BigInt(43_216),
        freshEstimate: BigInt(60_761),
      }),
    ).toBe(true);
    expect(
      isWalletGasEstimateStale({
        walletEstimate: BigInt(60_761),
        freshEstimate: BigInt(60_761),
      }),
    ).toBe(false);
    expect(RECOVER_APPROVE_OOG_USER_MESSAGE).not.toMatch(/^Deposit/);
  });
});
