"use client";

import { useCallback, useEffect, useState } from "react";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { readProviderChainId } from "@/lib/wallet/provider-chain";
import type { EIP1193Provider } from "viem";

const RH_CHAIN_ID = 4663;
const RH_CHAIN_HEX = `0x${RH_CHAIN_ID.toString(16)}`;
const RH_RPC =
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL?.trim() ||
  "https://rpc.mainnet.robinhoodchain.com";
const RH_EXPLORER = "https://explorer.robinhoodchain.com";

/**
 * Utility Index entry: detect live chain; one Switch to Robinhood CTA.
 * Does not auto-fire wallet_switch on mount (prevents duplicate pending prompts).
 */
export function RobinhoodNetworkPrep() {
  const { wallet, provider } = useDemoWallet();
  const [liveChainId, setLiveChainId] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    const eth = (provider ?? null) as EIP1193Provider | null;
    const cid = await readProviderChainId(eth);
    setLiveChainId(cid);
  }, [provider]);

  useEffect(() => {
    void sync();
    const eth = provider as EIP1193Provider | null;
    if (!eth || typeof eth.on !== "function") return;
    const onChain = (hex: string) => {
      const n = Number.parseInt(hex, 16);
      if (Number.isFinite(n)) setLiveChainId(n);
    };
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [provider, sync]);

  const switchToRobinhood = useCallback(async () => {
    const eth = provider as EIP1193Provider | null;
    if (!eth?.request) {
      setError("Connect a wallet first.");
      return;
    }
    if (switching) {
      setError("A network switch is already pending — confirm or reject it in your wallet.");
      return;
    }
    setSwitching(true);
    setError(null);
    try {
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: RH_CHAIN_HEX }],
        });
      } catch (switchErr) {
        const code =
          switchErr && typeof switchErr === "object" && "code" in switchErr
            ? Number((switchErr as { code: unknown }).code)
            : null;
        const msg =
          switchErr instanceof Error ? switchErr.message : String(switchErr);
        if (code === 4902 || /Unrecognized chain|unknown chain|4902/i.test(msg)) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: RH_CHAIN_HEX,
                chainName: "Robinhood Chain",
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [RH_RPC],
                blockExplorerUrls: [RH_EXPLORER],
              },
            ],
          });
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: RH_CHAIN_HEX }],
          });
        } else if (/reject|denied|cancel/i.test(msg)) {
          setError("Switch to Robinhood was rejected.");
          return;
        } else if (/already pending/i.test(msg)) {
          setError(
            "A network switch is already pending — confirm or reject it in your wallet.",
          );
          return;
        } else {
          throw switchErr;
        }
      }
      await sync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(false);
    }
  }, [provider, switching, sync]);

  if (wallet.state !== "connected") return null;
  if (liveChainId == null) return null;
  if (liveChainId === RH_CHAIN_ID) return null;

  return (
    <div
      className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-center"
      role="status"
    >
      <p className="text-sm text-[var(--color-ink)]">
        Utility Index trades on Robinhood Chain ({RH_CHAIN_ID}). Current chain:{" "}
        {liveChainId}.
      </p>
      <button
        type="button"
        disabled={switching}
        onClick={() => void switchToRobinhood()}
        className="mt-2 inline-flex h-9 min-w-[200px] items-center justify-center rounded-lg bg-[var(--color-brand)] px-4 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60"
      >
        {switching ? "Confirm in wallet…" : "Switch to Robinhood"}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
