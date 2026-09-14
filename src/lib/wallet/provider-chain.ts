/**
 * Shared EIP-1193 chain helpers — prefer live provider over wagmi cache.
 */
import type { EIP1193Provider } from "viem";

export async function readProviderChainId(
  provider: EIP1193Provider | null | undefined,
): Promise<number | null> {
  if (!provider?.request) return null;
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    const n = Number.parseInt(hex, 16);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function chainLabel(chainId: number | null | undefined): string {
  if (chainId == null) return "unknown";
  if (chainId === 8453) return "Base (8453)";
  if (chainId === 4663) return "Robinhood (4663)";
  if (chainId === 1) return "Ethereum (1)";
  if (chainId === 42161) return "Arbitrum (42161)";
  if (chainId === 31337) return `Local (${chainId})`;
  return `chain ${chainId}`;
}
