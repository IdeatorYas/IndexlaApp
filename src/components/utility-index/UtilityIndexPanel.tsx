"use client";

/**
 * Utility Index — direct ownership: eight basket tokens in the user wallet.
 * Buy = 1× depositFromEth. Sell = atomic wallet_sendCalls when approvals are
 * needed; warm exit is a single writeContract / sendCalls. No sequential fallback.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  maxUint256,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { robinhood } from "viem/chains";
import { AssetIcon } from "@/components/ui/AssetIcons";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import {
  BASKET,
  GATEWAY_ADDRESS,
  RH_CHAIN_ID,
  RH_EXPLORER,
  RH_RPC,
  buildBuyLegs,
  buildExitLegs,
  erc20Abi,
  gatewayAbi,
} from "@/lib/utility-index/constants";
import {
  DEFAULT_SLIPPAGE_BPS,
  minOutMap,
  quoteBuyLegs,
  quoteSellLegs,
  type BuyQuoteBundle,
  type SellQuoteBundle,
} from "@/lib/utility-index/quotes";
import { APP_ROUTES } from "@/lib/routes";
import { chainLabel } from "@/lib/wallet/provider-chain";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function parseChainId(hex: unknown): number | null {
  const n = Number(hex);
  return Number.isFinite(n) ? n : null;
}

const chain = { ...robinhood, id: RH_CHAIN_ID };
const DEADLINE_SEC = 1200;
const RH_CHAIN_HEX = `0x${RH_CHAIN_ID.toString(16)}`;

function formatUtilityWalletError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /4100|not been authorized by the user|UnauthorizedProvider|unauthorized/i.test(
      msg,
    )
  ) {
    return (
      "Wallet did not authorize this account for signing on Robinhood. " +
      "Reconnect with the same wallet AppKit connected (not a different browser extension), " +
      "confirm Robinhood Chain, and retry."
    );
  }
  if (/4001|user rejected|denied the request|ACTION_REJECTED/i.test(msg)) {
    return "Wallet request rejected.";
  }
  return msg.slice(0, 300);
}

async function authorizeConnectedAccount(
  provider: EthereumProvider,
  expected: Address,
): Promise<Address> {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const authorized = accounts[0];
  if (!authorized) {
    throw new Error("Wallet returned no authorized account.");
  }
  if (authorized.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `Connected address ${expected} is not authorized on the signing provider (${authorized}). Reconnect the same wallet used in AppKit.`,
    );
  }
  return authorized as Address;
}

function parseEthInput(raw: string): { ok: true; value: bigint } | { ok: false; reason: string } {
  const t = raw.trim();
  if (!t) return { ok: false, reason: "Enter an ETH amount." };
  if (!/^\d*\.?\d+$/.test(t)) return { ok: false, reason: `Invalid ETH amount: "${raw}".` };
  try {
    const value = parseEther(t as `${number}`);
    if (value <= BigInt(0)) return { ok: false, reason: "ETH amount must be greater than 0." };
    return { ok: true, value };
  } catch {
    return { ok: false, reason: `Could not parse ETH amount: "${raw}".` };
  }
}

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTokenAmount(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

export function UtilityIndexPanel() {
  const { wallet, connect, provider: appProvider } = useDemoWallet();
  const gateway = GATEWAY_ADDRESS;
  const gatewayReady = Boolean(gateway && /^0x[a-fA-F0-9]{40}$/i.test(gateway));

  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [ethIn, setEthIn] = useState("");
  const [sellPercent, setSellPercent] = useState(50);
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<
    { symbol: string; amount: string; raw: bigint; allowance: bigint }[]
  >([]);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);

  const [buyQuote, setBuyQuote] = useState<BuyQuoteBundle | null>(null);
  const [buyQuoteError, setBuyQuoteError] = useState<string | null>(null);
  const [buyGasWei, setBuyGasWei] = useState<bigint | null>(null);
  const [buyGasError, setBuyGasError] = useState<string | null>(null);
  const [buyQuoting, setBuyQuoting] = useState(false);

  const [sellQuote, setSellQuote] = useState<SellQuoteBundle | null>(null);
  const [sellQuoteError, setSellQuoteError] = useState<string | null>(null);
  const [sellQuoting, setSellQuoting] = useState(false);

  const [gasPrice, setGasPrice] = useState<bigint | null>(null);

  const publicClient = useMemo(
    () => createPublicClient({ chain, transport: http(RH_RPC) }),
    [],
  );

  // Shell wallet → panel account (browse/connect without forcing RH).
  useEffect(() => {
    if (wallet.state === "connected" && wallet.address) {
      setAccount(wallet.address as Address);
    } else if (wallet.state === "disconnected") {
      setAccount(null);
    }
  }, [wallet.state, wallet.address]);

  useEffect(() => {
    void publicClient.getGasPrice().then(setGasPrice).catch(() => setGasPrice(null));
  }, [publicClient]);

  const refresh = useCallback(async () => {
    if (!account) return;
    try {
      const eth = await publicClient.getBalance({ address: account });
      setEthBalance(eth);
      const rows = await Promise.all(
        BASKET.map(async (t) => {
          const bal = await publicClient.readContract({
            address: t.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          });
          let allowance = BigInt(0);
          if (gatewayReady && gateway) {
            allowance = await publicClient.readContract({
              address: t.address,
              abi: erc20Abi,
              functionName: "allowance",
              args: [account, gateway as Address],
            });
          }
          return {
            symbol: t.symbol,
            amount: formatUnits(bal, 18),
            raw: bal,
            allowance,
          };
        }),
      );
      setBalances(rows);
    } catch (e) {
      setError(`Refresh failed: ${String(e).slice(0, 200)}`);
    }
  }, [account, gateway, gatewayReady, publicClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live EIP-1193 chain/account sync on the AppKit connector provider (not window.ethereum).
  useEffect(() => {
    const ethereum = appProvider as EthereumProvider | null;
    if (!ethereum?.request) return;

    void ethereum.request({ method: "eth_chainId" }).then((hex) => {
      const n = parseChainId(hex);
      if (n != null) setChainId(n);
    });

    if (!ethereum.on) return;
    const onChainChanged = (hex: unknown) => {
      const n = parseChainId(hex);
      if (n != null) setChainId(n);
    };
    const onAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      setAccount(list[0] ? (list[0] as Address) : null);
      void ethereum.request({ method: "eth_chainId" }).then((hex) => {
        const n = parseChainId(hex);
        if (n != null) setChainId(n);
      });
    };
    ethereum.on("chainChanged", onChainChanged);
    ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      ethereum.removeListener?.("chainChanged", onChainChanged);
      ethereum.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [appProvider]);

  // --- Buy quotes ---
  useEffect(() => {
    if (!gatewayReady || !gateway) return;
    const parsed = parseEthInput(ethIn);
    if (!parsed.ok) {
      setBuyQuote(null);
      setBuyQuoteError(parsed.reason);
      setBuyGasWei(null);
      setBuyGasError(null);
      setBuyQuoting(false);
      return;
    }

    let cancelled = false;
    setBuyQuoting(true);
    setBuyQuoteError(null);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const q = await quoteBuyLegs({
            client: publicClient,
            grossEth: parsed.value,
            slippageBps,
          });
          if (cancelled) return;
          setBuyQuote(q);
          if (!q.quotesOk) {
            setBuyQuoteError(q.errors.join(" · "));
            setBuyGasWei(null);
            setBuyGasError(null);
            return;
          }
          const legs = buildBuyLegs(minOutMap(q.legs));
          const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);
          const data = encodeFunctionData({
            abi: gatewayAbi,
            functionName: "depositFromEth",
            args: [legs.v3, legs.v2, legs.v4, deadline],
          });
          try {
            const gas = await publicClient.estimateGas({
              account: account ?? undefined,
              to: gateway as Address,
              data,
              value: parsed.value,
            });
            if (cancelled) return;
            setBuyGasWei(gas);
            setBuyGasError(null);
          } catch (e) {
            if (cancelled) return;
            setBuyGasWei(null);
            setBuyGasError(
              `Gas estimate failed (tx would revert): ${
                e instanceof Error ? e.message.slice(0, 220) : String(e).slice(0, 220)
              }`,
            );
          }
        } catch (e) {
          if (cancelled) return;
          setBuyQuote(null);
          setBuyQuoteError(
            e instanceof Error ? e.message.slice(0, 240) : String(e).slice(0, 240),
          );
          setBuyGasWei(null);
        } finally {
          if (!cancelled) setBuyQuoting(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ethIn, slippageBps, gateway, gatewayReady, publicClient, account]);

  // --- Sell quotes ---
  useEffect(() => {
    if (!gatewayReady || !gateway || balances.length === 0) return;
    const percentBps = Math.min(100, Math.max(1, sellPercent)) * 100;
    const amountIns: Record<string, bigint> = {};
    for (const row of balances) {
      amountIns[row.symbol] = (row.raw * BigInt(percentBps)) / BigInt(10_000);
    }
    const any = Object.values(amountIns).some((a) => a > BigInt(0));
    if (!any) {
      setSellQuote(null);
      setSellQuoteError("No basket token balance to sell.");
      setSellQuoting(false);
      return;
    }

    let cancelled = false;
    setSellQuoting(true);
    setSellQuoteError(null);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const q = await quoteSellLegs({
            client: publicClient,
            amountIns,
            slippageBps,
          });
          if (cancelled) return;
          setSellQuote(q);
          if (!q.quotesOk) {
            setSellQuoteError(q.errors.join(" · "));
          }
        } catch (e) {
          if (cancelled) return;
          setSellQuote(null);
          setSellQuoteError(
            e instanceof Error ? e.message.slice(0, 240) : String(e).slice(0, 240),
          );
        } finally {
          if (!cancelled) setSellQuoting(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [balances, sellPercent, slippageBps, gateway, gatewayReady, publicClient]);

  const buyBlockReason = useMemo(() => {
    if (!gatewayReady) return "Gateway address not configured.";
    if (!account) return "Connect a wallet first.";
    const parsed = parseEthInput(ethIn);
    if (!parsed.ok) return parsed.reason;
    if (buyQuoting) return null;
    if (buyQuoteError) return buyQuoteError;
    if (!buyQuote?.quotesOk) return buyQuote?.errors.join(" · ") || "Buy quotes not ready.";
    if (buyGasError) return buyGasError;
    if (ethBalance !== null && buyGasWei !== null && gasPrice !== null) {
      const gasCost = buyGasWei * gasPrice;
      const need = parsed.value + gasCost;
      if (ethBalance < need) {
        return `Wallet has ${formatEther(ethBalance)} ETH; need ≈ ${formatEther(need)} ETH (${formatEther(parsed.value)} buy + ≈${formatEther(gasCost)} gas).`;
      }
    } else if (ethBalance !== null && ethBalance < parsed.value) {
      return `Wallet has ${formatEther(ethBalance)} ETH; buy needs ${formatEther(parsed.value)} ETH (excluding gas).`;
    }
    return null;
  }, [
    gatewayReady,
    account,
    ethIn,
    buyQuoting,
    buyQuoteError,
    buyQuote,
    buyGasError,
    ethBalance,
    buyGasWei,
    gasPrice,
  ]);

  const sellBlockReason = useMemo(() => {
    if (!gatewayReady) return "Gateway address not configured.";
    if (!account) return "Connect a wallet first.";
    if (sellQuoting) return null;
    if (sellQuoteError) return sellQuoteError;
    if (!sellQuote?.quotesOk) return sellQuote?.errors.join(" · ") || "Sell quotes not ready.";
    return null;
  }, [gatewayReady, account, sellQuoting, sellQuoteError, sellQuote]);

  const needsAnyApprove = useMemo(() => {
    const percentBps = Math.min(100, Math.max(1, sellPercent)) * 100;
    return BASKET.some((t) => {
      const row = balances.find((b) => b.symbol === t.symbol);
      if (!row) return false;
      const need = (row.raw * BigInt(percentBps)) / BigInt(10_000);
      return need > BigInt(0) && row.allowance < need;
    });
  }, [balances, sellPercent]);

  async function ensureRobinhoodChain(ethereum: EthereumProvider): Promise<boolean> {
    const cid = parseChainId(await ethereum.request({ method: "eth_chainId" }));
    if (cid != null) setChainId(cid);
    if (cid === RH_CHAIN_ID) return true;
    try {
      try {
        await ethereum.request({
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
          await ethereum.request({
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
          await ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: RH_CHAIN_HEX }],
          });
        } else {
          throw switchErr;
        }
      }
      const after = parseChainId(await ethereum.request({ method: "eth_chainId" }));
      if (after != null) setChainId(after);
      if (after === RH_CHAIN_ID) return true;
      setError(`Still on ${chainLabel(after)}; switch to Robinhood (${RH_CHAIN_ID}) to continue.`);
      return false;
    } catch (e) {
      setError(
        /4001|reject|denied|cancel/i.test(String(e))
          ? `Switch to Robinhood Chain (${RH_CHAIN_ID}) was rejected.`
          : `Switch wallet to Robinhood Chain (${RH_CHAIN_ID}) to buy or sell.`,
      );
      return false;
    }
  }

  async function buy() {
    const ethereum = appProvider as EthereumProvider | null;
    if (!ethereum?.request || !account || !gatewayReady || !gateway) {
      setError(
        !appProvider
          ? "No AppKit wallet provider — reconnect your wallet, then retry Buy."
          : "Connect a wallet first.",
      );
      return;
    }
    if (buyBlockReason) {
      setError(buyBlockReason);
      return;
    }
    const parsed = parseEthInput(ethIn);
    if (!parsed.ok || !buyQuote) return;

    setBusy(true);
    setError(null);
    setStatus("");
    try {
      if (!(await ensureRobinhoodChain(ethereum))) return;
      const signer = await authorizeConnectedAccount(ethereum, account);
      const walletClient = createWalletClient({
        account: signer,
        chain,
        transport: custom(ethereum),
      });
      const fresh = await quoteBuyLegs({
        client: publicClient,
        grossEth: parsed.value,
        slippageBps,
      });
      if (!fresh.quotesOk) {
        setError(`Buy blocked: ${fresh.errors.join(" · ")}`);
        return;
      }
      const legs = buildBuyLegs(minOutMap(fresh.legs));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);
      setStatus("Confirm buy in your wallet…");
      const hash = await walletClient.writeContract({
        address: gateway as Address,
        abi: gatewayAbi,
        functionName: "depositFromEth",
        args: [legs.v3, legs.v2, legs.v4, deadline],
        value: parsed.value,
        account: signer,
        chain,
      });
      setStatus(`Buy submitted · tx ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
      await refresh();
      setStatus(`Buy confirmed · tx ${hash} — basket tokens are in your wallet`);
    } catch (e) {
      setError(`Buy failed: ${formatUtilityWalletError(e)}`);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function pollCallsStatus(
    ethereum: EthereumProvider,
    batchId: string,
  ): Promise<unknown> {
    let statusJson: unknown = null;
    for (let i = 0; i < 40; i += 1) {
      try {
        statusJson = await ethereum.request({
          method: "wallet_getCallsStatus",
          params: [batchId],
        });
        const st = statusJson as { status?: number | string; receipts?: unknown[] };
        const code = st?.status;
        if (
          code === 200 ||
          code === "CONFIRMED" ||
          code === 1 ||
          (Array.isArray(st?.receipts) && st.receipts.length > 0)
        ) {
          break;
        }
        if (code === 100 || code === "FAILED" || code === 3) break;
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return statusJson;
  }

  async function sell() {
    const ethereum = appProvider as EthereumProvider | null;
    if (!ethereum?.request || !account || !gatewayReady || !gateway) {
      setError(
        !appProvider
          ? "No AppKit wallet provider — reconnect your wallet, then retry Sell."
          : "Connect a wallet first.",
      );
      return;
    }
    if (sellBlockReason) {
      setError(sellBlockReason);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("");
    try {
      if (!(await ensureRobinhoodChain(ethereum))) return;
      const signer = await authorizeConnectedAccount(ethereum, account);

      const percentBps = Math.min(100, Math.max(1, sellPercent)) * 100;
      const amountIns: Record<string, bigint> = {};
      for (const row of balances) {
        amountIns[row.symbol] = (row.raw * BigInt(percentBps)) / BigInt(10_000);
      }
      if (!Object.values(amountIns).some((v) => v > BigInt(0))) {
        setError("No basket token balances to sell. Buy first.");
        return;
      }

      const fresh = await quoteSellLegs({
        client: publicClient,
        amountIns,
        slippageBps,
      });
      if (!fresh.quotesOk) {
        setError(`Sell blocked: ${fresh.errors.join(" · ")}`);
        return;
      }

      const exit = buildExitLegs(minOutMap(fresh.legs));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);
      const exitData = encodeFunctionData({
        abi: gatewayAbi,
        functionName: "exitPercentToEth",
        args: [
          BigInt(percentBps),
          exit.v3,
          exit.v2,
          exit.v4,
          fresh.minAmountOutEth,
          deadline,
        ],
      });

      const needsApprove = BASKET.filter((t) => {
        const need = amountIns[t.symbol] ?? BigInt(0);
        if (need === BigInt(0)) return false;
        const have = balances.find((b) => b.symbol === t.symbol)?.allowance ?? BigInt(0);
        return have < need;
      });

      // Cold path: atomic batch only — never fall back to sequential approvals.
      if (needsApprove.length > 0) {
        let atomicStatus: string | null = null;
        try {
          const caps = (await ethereum.request({
            method: "wallet_getCapabilities",
            params: [signer, [RH_CHAIN_HEX]],
          })) as Record<string, { atomic?: { status?: string } }>;
          atomicStatus =
            caps?.[RH_CHAIN_HEX]?.atomic?.status ??
            caps?.[RH_CHAIN_HEX.toLowerCase()]?.atomic?.status ??
            null;
        } catch (e) {
          setError(
            `Atomic batch unavailable: wallet_getCapabilities failed (${String(e).slice(0, 180)}). Your wallet must support wallet_sendCalls with atomicRequired on Robinhood ${RH_CHAIN_ID} for first-time sells that need approvals. No sequential fallback.`,
          );
          return;
        }

        if (atomicStatus !== "supported" && atomicStatus !== "ready") {
          setError(
            `Atomic batch unavailable: wallet reports atomic.status=${JSON.stringify(atomicStatus)} on Robinhood ${RH_CHAIN_ID}. Approvals + sell must be bundled in one wallet_sendCalls (atomicRequired). No sequential fallback.`,
          );
          return;
        }

        const calls = [
          ...needsApprove.map((t) => ({
            to: t.address,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [gateway as Address, maxUint256],
            }),
            value: "0x0" as const,
          })),
          {
            to: gateway as Address,
            data: exitData,
            value: "0x0" as const,
          },
        ];

        setStatus(
          `Confirm atomic sell in your wallet… (${calls.length} calls: ${needsApprove.length} approvals + exit)`,
        );
        let batch: { id?: string } | string;
        try {
          batch = (await ethereum.request({
            method: "wallet_sendCalls",
            params: [
              {
                version: "2.0.0",
                from: signer,
                chainId: RH_CHAIN_HEX,
                atomicRequired: true,
                calls,
              },
            ],
          })) as { id?: string } | string;
        } catch (e) {
          setError(
            `Atomic sell failed: ${formatUtilityWalletError(e)}. No sequential fallback — retry with a wallet that supports atomic batching on Robinhood, or approve tokens another way then use a warm sell.`,
          );
          setStatus("");
          return;
        }

        const batchId =
          typeof batch === "string"
            ? batch
            : batch?.id ?? JSON.stringify(batch).slice(0, 120);
        setStatus(`Sell batch submitted · batchId ${batchId}`);
        const callsStatus = await pollCallsStatus(ethereum, batchId);
        await refresh();
        const receiptHint = callsStatus
          ? ` · status ${JSON.stringify(callsStatus).slice(0, 240)}`
          : "";
        setStatus(
          `Sell submitted · batchId ${batchId} · ${sellPercent}% → ETH (min ${formatEther(fresh.minAmountOutEth)} ETH)${receiptHint}`,
        );
        return;
      }

      // Warm path: single exit via writeContract (1 confirmation).
      const walletClient = createWalletClient({
        account: signer,
        chain,
        transport: custom(ethereum),
      });
      setStatus("Confirm sell in your wallet…");
      const hash = await walletClient.writeContract({
        address: gateway as Address,
        abi: gatewayAbi,
        functionName: "exitPercentToEth",
        args: [
          BigInt(percentBps),
          exit.v3,
          exit.v2,
          exit.v4,
          fresh.minAmountOutEth,
          deadline,
        ],
        account: signer,
        chain,
      });
      setStatus(`Sell submitted · tx ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
      await refresh();
      setStatus(
        `Sell confirmed · tx ${hash} · ${sellPercent}% → ETH (min ${formatEther(fresh.minAmountOutEth)} ETH)`,
      );
    } catch (e) {
      setError(`Sell failed: ${formatUtilityWalletError(e)}`);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(account);
  const displayChain = chainLabel(chainId);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <nav
        className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted"
        aria-label="Breadcrumb"
      >
        <Link href={APP_ROUTES.dashboard} className="hover:text-app-brand">
          INDEXLA Core
        </Link>
        <span aria-hidden className="text-app-dim">
          →
        </span>
        <Link
          href={`${APP_ROUTES.discover}?tab=indexes`}
          className="hover:text-app-brand"
        >
          Indexes
        </Link>
        <span aria-hidden className="text-app-dim">
          →
        </span>
        <Link
          href={`${APP_ROUTES.discover}?tab=indexes&type=Crypto`}
          className="hover:text-app-brand"
        >
          Crypto
        </Link>
        <span aria-hidden className="text-app-dim">
          →
        </span>
        <Link
          href={`${APP_ROUTES.discover}?tab=indexes&type=Crypto&chain=robinhood`}
          className="text-app-brand hover:underline"
        >
          Robinhood
        </Link>
      </nav>

      <header className="space-y-3">
        <div>
          <h1 className="app-display text-2xl font-bold text-app-ink sm:text-[1.75rem]">
            Utility Index
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-app-muted">
            Buy the eight-token Robinhood basket with ETH. Tokens land in your
            wallet — sell any percent back to ETH when you want.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {BASKET.map((t) => (
            <div
              key={t.symbol}
              className="inline-flex items-center gap-1.5 rounded-full border border-app-line/70 bg-app-elevated/80 px-2 py-1"
            >
              <AssetIcon assetId={t.symbol.toLowerCase()} size={18} />
              <span className="text-[11px] font-bold text-app-ink">{t.symbol}</span>
              <span className="text-[10px] font-semibold text-app-muted">
                {(t.weightBps / 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </header>

      <section className="app-panel flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-dim">
            Wallet
          </p>
          {connected ? (
            <p className="truncate text-sm font-semibold text-app-ink">
              {shorten(account!)}
              <span className="mx-1.5 text-app-dim">·</span>
              <span className="font-medium text-app-muted">{displayChain}</span>
              {ethBalance !== null ? (
                <>
                  <span className="mx-1.5 text-app-dim">·</span>
                  <span className="font-mono text-[13px]">
                    {Number(formatEther(ethBalance)).toFixed(4)} ETH
                  </span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-app-muted">
              Connect to buy, view holdings, and sell. Network switch happens only
              when you trade.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={connect}
              className="app-gradient-btn h-9 rounded-[10px] px-4 text-[12px] font-bold"
            >
              Connect Wallet
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void refresh()}
              className="app-interactive h-9 rounded-[10px] border border-app-line bg-app-elevated px-3 text-[12px] font-bold text-app-ink"
            >
              Refresh
            </button>
          )}
          {gatewayReady ? (
            <a
              href={`${RH_EXPLORER}/address/${gateway}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-app-brand hover:underline"
            >
              Gateway
            </a>
          ) : (
            <span className="text-[11px] font-semibold text-app-danger">
              Gateway not configured
            </span>
          )}
        </div>
      </section>

      {gatewayReady ? (
        <>
          <section className="app-panel space-y-4 rounded-2xl p-4 sm:p-5">
            <div>
              <h2 className="app-display text-lg font-bold text-app-ink">Buy with ETH</h2>
              <p className="mt-0.5 text-xs text-app-muted">
                One wallet confirmation · tokens land in your wallet
              </p>
            </div>

            <label className="block text-xs" htmlFor="utility-eth-in">
              <span className="font-semibold text-app-dim">ETH amount</span>
              <input
                id="utility-eth-in"
                className="app-input mt-1.5 w-full max-w-xs rounded-[10px] px-3 py-2.5 font-mono text-sm"
                value={ethIn}
                placeholder="0.01"
                inputMode="decimal"
                onChange={(e) => setEthIn(e.target.value)}
              />
            </label>

            <label className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
              <span className="font-semibold text-app-dim">Slippage</span>
              <input
                type="number"
                min={1}
                max={2000}
                className="app-input w-20 rounded-[8px] px-2 py-1.5 font-mono text-[12px]"
                value={slippageBps}
                onChange={(e) =>
                  setSlippageBps(Math.min(2000, Math.max(1, Number(e.target.value) || 1)))
                }
              />
              <span>bps</span>
            </label>

            <div className="rounded-[12px] border border-app-line/60 bg-app-elevated/50 px-3 py-2.5 text-xs text-app-muted">
              {buyQuoting && <p>Quoting…</p>}
              {!buyQuoting && buyQuote?.quotesOk && (
                <div className="space-y-1">
                  <p className="font-medium text-app-ink">
                    {buyQuote.activeLegCount}/8 legs · after fee{" "}
                    <span className="font-mono">
                      {formatEther(buyQuote.investableEth)} ETH
                    </span>
                  </p>
                  {buyGasWei !== null && gasPrice !== null && (
                    <p>
                      Est. gas ≈{" "}
                      <span className="font-mono">
                        {formatEther(buyGasWei * gasPrice)} ETH
                      </span>
                    </p>
                  )}
                </div>
              )}
              {buyBlockReason && ethIn.trim() && (
                <p className="text-app-danger">{buyBlockReason}</p>
              )}
            </div>

            <button
              type="button"
              disabled={busy || !account || Boolean(buyBlockReason) || buyQuoting}
              onClick={() => void buy()}
              className="app-gradient-btn h-11 w-full rounded-[12px] text-sm font-bold disabled:opacity-40 sm:w-auto sm:px-8"
            >
              {busy ? "Working…" : "Buy basket"}
            </button>
          </section>

          <section className="app-panel space-y-4 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="app-display text-lg font-bold text-app-ink">Holdings</h2>
                <p className="mt-0.5 text-xs text-app-muted">
                  Tokens in your wallet · sell uses gateway allowance
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-app-line/70 text-[10px] font-bold uppercase tracking-[0.12em] text-app-dim">
                    <th className="pb-2 pr-3 font-bold">Asset</th>
                    <th className="pb-2 pr-3 font-bold">Amount</th>
                    <th className="pb-2 font-bold">Allowance</th>
                  </tr>
                </thead>
                <tbody>
                  {BASKET.map((t) => {
                    const row = balances.find((b) => b.symbol === t.symbol);
                    const allowed = row && row.allowance > BigInt(0);
                    return (
                      <tr
                        key={t.symbol}
                        className="border-b border-app-line/40 last:border-0"
                      >
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <AssetIcon assetId={t.symbol.toLowerCase()} size={22} />
                            <div>
                              <p className="font-semibold text-app-ink">{t.symbol}</p>
                              <p className="text-[10px] text-app-muted">
                                {(t.weightBps / 100).toFixed(0)}% weight
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[12px] text-app-ink">
                          {row ? formatTokenAmount(row.amount) : "—"}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={
                              allowed
                                ? "rounded-md bg-app-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-success"
                                : "rounded-md bg-app-elevated px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-muted"
                            }
                          >
                            {allowed ? "Approved" : "On first sell"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="app-panel space-y-4 rounded-2xl p-4 sm:p-5">
            <div>
              <h2 className="app-display text-lg font-bold text-app-ink">Sell to ETH</h2>
              <p className="mt-0.5 text-xs text-app-muted">
                {needsAnyApprove
                  ? "First sell bundles approvals + exit (target ≤3–4 wallet confirms)"
                  : "Allowances set · one wallet confirmation"}
              </p>
            </div>

            <label className="block text-xs" htmlFor="utility-sell-pct">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-app-dim">Sell percent</span>
                <span className="font-mono text-sm font-bold text-app-ink">
                  {sellPercent}%
                </span>
              </div>
              <input
                id="utility-sell-pct"
                type="range"
                min={1}
                max={100}
                value={sellPercent}
                onChange={(e) => setSellPercent(Number(e.target.value))}
                className="mt-3 w-full accent-[var(--color-brand)]"
              />
            </label>

            <div className="rounded-[12px] border border-app-line/60 bg-app-elevated/50 px-3 py-2.5 text-xs text-app-muted">
              {sellQuoting && <p>Quoting…</p>}
              {!sellQuoting && sellQuote?.quotesOk && (
                <p className="font-medium text-app-ink">
                  Quoted ≈{" "}
                  <span className="font-mono">
                    {formatEther(sellQuote.quotedGrossEth)} ETH
                  </span>
                  {" · "}
                  min out{" "}
                  <span className="font-mono">
                    {formatEther(sellQuote.minAmountOutEth)} ETH
                  </span>
                </p>
              )}
              {sellBlockReason && connected && (
                <p className="text-app-danger">{sellBlockReason}</p>
              )}
            </div>

            <button
              type="button"
              disabled={busy || !account || Boolean(sellBlockReason) || sellQuoting}
              onClick={() => void sell()}
              className="app-gradient-btn h-11 w-full rounded-[12px] text-sm font-bold disabled:opacity-40 sm:w-auto sm:px-8"
            >
              {busy ? "Working…" : `Sell ${sellPercent}%`}
            </button>
          </section>
        </>
      ) : (
        <section className="app-panel rounded-2xl p-5 text-sm text-app-muted">
          Set{" "}
          <code className="rounded bg-app-elevated px-1.5 py-0.5 text-[12px] text-app-ink">
            NEXT_PUBLIC_INDEXLA_GATEWAY_4663
          </code>{" "}
          after deploying IndexlaGateway4663.
        </section>
      )}

      {(status || error) && (
        <section
          className={`app-panel rounded-2xl p-4 text-sm whitespace-pre-wrap break-all ${
            error ? "border border-app-danger/40 text-app-danger" : "text-app-ink"
          }`}
          role="status"
        >
          {error ? <p>{error}</p> : null}
          {status ? <p className={error ? "mt-2 text-app-muted" : undefined}>{status}</p> : null}
        </section>
      )}
    </div>
  );
}
