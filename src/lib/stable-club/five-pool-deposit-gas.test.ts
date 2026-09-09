import { describe, expect, it, vi } from "vitest";
import {
  DEPOSIT_FIVE_POOL_STRATEGY_SELECTOR,
  FIVE_POOL_DEPOSIT_GAS_CEILING,
  FIVE_POOL_DEPOSIT_GAS_FLOOR,
  FIVE_POOL_DEPOSIT_OOG_USER_MESSAGE,
  applyFivePoolDepositGasBuffer,
  forceDepositFivePoolStrategyGasLimit,
  inflateDepositFivePoolEstimateGasHex,
  isDepositFivePoolStrategyCalldata,
  isOutOfGasReceipt,
  preflightDepositFivePoolStrategyCall,
  requireFivePoolDepositGasLimit,
  resolveOutOfGasGasLimit,
  toHexGasQuantity,
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

  it("floors the ac64ff1b implied estimate (4_686_940) to 10M", () => {
    const estimate = BigInt(4_686_940);
    const bufferOnly = (estimate * BigInt(14_000)) / BigInt(10_000);
    expect(bufferOnly).toBe(BigInt(6_561_716));
    expect(applyFivePoolDepositGasBuffer(estimate)).toBe(FIVE_POOL_DEPOSIT_GAS_FLOOR);
    expect(requireFivePoolDepositGasLimit(applyFivePoolDepositGasBuffer(estimate))).toBe(
      FIVE_POOL_DEPOSIT_GAS_FLOOR,
    );
  });

  it("floors the 0x5bab6b53 raw estimate (6_221_050) to 10M", () => {
    const estimate = BigInt(6_221_050);
    expect(applyFivePoolDepositGasBuffer(estimate)).toBe(FIVE_POOL_DEPOSIT_GAS_FLOOR);
    expect(forceDepositFivePoolStrategyGasLimit(estimate)).toBe(FIVE_POOL_DEPOSIT_GAS_FLOOR);
    expect(inflateDepositFivePoolEstimateGasHex("0x5eecfa")).toBe(
      toHexGasQuantity(FIVE_POOL_DEPOSIT_GAS_FLOOR),
    );
    expect(isDepositFivePoolStrategyCalldata(`${DEPOSIT_FIVE_POOL_STRATEGY_SELECTOR}00`)).toBe(
      true,
    );
  });

  it("applies +40% when above the floor", () => {
    const estimate = BigInt(12_000_000);
    expect(applyFivePoolDepositGasBuffer(estimate)).toBe(BigInt(16_800_000));
  });

  it("requireFivePoolDepositGasLimit rejects below floor", () => {
    expect(() => requireFivePoolDepositGasLimit(BigInt(6_561_716))).toThrow(/below the required minimum/i);
    expect(() => requireFivePoolDepositGasLimit(FIVE_POOL_DEPOSIT_GAS_CEILING + BigInt(1))).toThrow(
      /too high/i,
    );
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

  it("detects wallet-substituted OOG using mined gas (not requested 10M)", () => {
    const requested = FIVE_POOL_DEPOSIT_GAS_FLOOR;
    const mined = BigInt(6_561_716);
    const used = BigInt(6_554_393);
    // Comparing against requested would miss OOG
    expect(
      isOutOfGasReceipt({
        status: "reverted",
        gasLimit: requested,
        gasUsed: used,
      }),
    ).toBe(false);
    // Mined limit detects OOG
    expect(
      isOutOfGasReceipt({
        status: "reverted",
        gasLimit: mined,
        gasUsed: used,
      }),
    ).toBe(true);
    expect(resolveOutOfGasGasLimit({ minedGasLimit: mined, requestedGasLimit: requested })).toBe(
      mined,
    );
  });

  it("preflightDepositFivePoolStrategyCall enforces floor then calls", async () => {
    const call = vi.fn().mockResolvedValue(undefined);
    await preflightDepositFivePoolStrategyCall({
      gas: FIVE_POOL_DEPOSIT_GAS_FLOOR,
      call,
    });
    expect(call).toHaveBeenCalledWith({ gas: FIVE_POOL_DEPOSIT_GAS_FLOOR });
    await expect(
      preflightDepositFivePoolStrategyCall({
        gas: BigInt(1_000_000),
        call,
      }),
    ).rejects.toThrow(/below the required minimum/i);
  });
});
