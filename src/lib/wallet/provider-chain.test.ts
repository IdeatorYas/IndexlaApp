import { describe, expect, it, vi } from "vitest";
import { chainLabel, readProviderChainId } from "@/lib/wallet/provider-chain";
import type { EIP1193Provider } from "viem";

describe("provider-chain", () => {
  it("labels Base and Robinhood clearly", () => {
    expect(chainLabel(8453)).toBe("Base (8453)");
    expect(chainLabel(4663)).toBe("Robinhood (4663)");
    expect(chainLabel(1)).toBe("Ethereum (1)");
    expect(chainLabel(null)).toBe("unknown");
  });

  it("reads live eth_chainId from the EIP-1193 provider", async () => {
    const request = vi.fn().mockResolvedValue("0x2105"); // 8453
    const provider = { request } as unknown as EIP1193Provider;
    await expect(readProviderChainId(provider)).resolves.toBe(8453);
    expect(request).toHaveBeenCalledWith({ method: "eth_chainId" });
  });

  it("returns null when provider is missing", async () => {
    await expect(readProviderChainId(null)).resolves.toBeNull();
  });
});
