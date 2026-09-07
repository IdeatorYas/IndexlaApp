import { describe, expect, it, vi } from "vitest";
import {
  formatGasPriceCeilingExceededMessage,
  requireGasPriceWithinSafetyCeiling,
} from "@/lib/stable-club/gas-price-ceiling-preflight";

const SAFETY = "0x429df0c70eEfCC5CD6b8B8FB94Ca8eDe226feDe5" as const;

describe("gas-price-ceiling-preflight", () => {
  it("formats a clear GasPriceTooHigh message", () => {
    const msg = formatGasPriceCeilingExceededMessage({
      txGasPriceWei: 1_004_066_531n,
      maxGasPriceWei: 1_000_000_000n,
    });
    expect(msg).toMatch(/exceeds SafetyController maxGasPriceWei/);
    expect(msg).toMatch(/GasPriceTooHigh/);
    expect(msg).toMatch(/1 gwei/);
  });

  it("passes when tx gas price is within ceiling", async () => {
    const readContract = vi.fn().mockResolvedValue(100_000_000_000n); // 100 gwei
    const getGasPrice = vi.fn().mockResolvedValue(6_000_000n);
    const result = await requireGasPriceWithinSafetyCeiling({
      publicClient: { readContract, getGasPrice },
      safetyController: SAFETY,
    });
    expect(result.ok).toBe(true);
    expect(result.maxGasPriceWei).toBe(100_000_000_000n);
    expect(getGasPrice).toHaveBeenCalled();
  });

  it("throws when tx gas price exceeds ceiling", async () => {
    const readContract = vi.fn().mockResolvedValue(1_000_000_000n); // 1 gwei
    const getGasPrice = vi.fn().mockResolvedValue(1_004_066_531n);
    await expect(
      requireGasPriceWithinSafetyCeiling({
        publicClient: { readContract, getGasPrice },
        safetyController: SAFETY,
      }),
    ).rejects.toThrow(/GasPriceTooHigh/);
  });

  it("uses txGasPriceWei override when provided", async () => {
    const readContract = vi.fn().mockResolvedValue(1_000_000_000n);
    const getGasPrice = vi.fn();
    await expect(
      requireGasPriceWithinSafetyCeiling({
        publicClient: { readContract, getGasPrice },
        safetyController: SAFETY,
        txGasPriceWei: 2_000_000_000n,
      }),
    ).rejects.toThrow(/exceeds/);
    expect(getGasPrice).not.toHaveBeenCalled();
  });
});
