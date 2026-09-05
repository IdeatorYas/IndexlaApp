import { describe, expect, it } from "vitest";
import {
  FIVE_POOL_DEPOSIT_GAS_FLOOR,
  FIVE_POOL_DEPOSIT_OOG_USER_MESSAGE,
  applyFivePoolDepositGasBuffer,
  isOutOfGasReceipt,
} from "@/lib/stable-club/five-pool-deposit-gas";

describe("five-pool-deposit-gas", () => {
  it("buffers the failed live deposit estimate above the OOG gas limit", () => {
    // Tx 0x1e76759c…: estimate≈6586426, limit=6588409, OOG.
    const estimate = BigInt(6_586_426);
    const limited = BigInt(6_588_409);
    const buffered = applyFivePoolDepositGasBuffer(estimate);
    expect(buffered).toBe(FIVE_POOL_DEPOSIT_GAS_FLOOR);
    expect(buffered > limited).toBe(true);
  });

  it("applies +40% when above the floor", () => {
    const estimate = BigInt(12_000_000);
    expect(applyFivePoolDepositGasBuffer(estimate)).toBe(BigInt(16_800_000));
  });

  it("detects OOG receipts where gasUsed == gasLimit", () => {
    expect(
      isOutOfGasReceipt({
        status: "reverted",
        gasLimit: BigInt(6_588_409),
        gasUsed: BigInt(6_588_409),
      }),
    ).toBe(true);
    expect(
      isOutOfGasReceipt({
        status: "success",
        gasLimit: BigInt(6_588_409),
        gasUsed: BigInt(6_588_409),
      }),
    ).toBe(false);
    expect(FIVE_POOL_DEPOSIT_OOG_USER_MESSAGE).toMatch(/out of gas/i);
  });
});
