"use client";

/**
 * Utility Index — direct ownership: all eight basket tokens in the user wallet.
 * Buy/sell use fresh quotes + slippage floors. Amount is user-chosen; only
 * genuinely unexecutable sizes are blocked (with exact reason).
 *
 * Honest prompts (plain EOA on RH 4663):
 *   buy = 1 · first cold sell = 9 (8× approve + exit) · warm sell = 1
 * ≤3 first-sell is UNRESOLVED on ordinary wallets.
 */
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
import {
  BASKET,
  GATEWAY_ADDRESS,
  PROMPT_INVENTORY,
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
import { chainLabel } from "@/lib/wallet/provider-chain";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { ethereum?: EthereumProvider };
  return w.ethereum;
}

const chain = { ...robinhood, id: RH_CHAIN_ID };
const DEADLINE_SEC = 1200;

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

export function UtilityIndexPanel() {
  const gateway = GATEWAY_ADDRESS;
  const gatewayReady = Boolean(gateway && /^0x[a-fA-F0-9]{40}$/i.test(gateway));

  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [ethIn, setEthIn] = useState("");
  const [sellPercent, setSellPercent] = useState(50);
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [status, setStatus] = useState("");
  const [balances, setBalances] = useState<
    { symbol: string; amount: string; raw: bigint; allowance: bigint }[]
  >([]);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [promptCount, setPromptCount] = useState(0);

  const [buyQuote, setBuyQuote] = useState<BuyQuoteBundle | null>(null);
  const [buyQuoteError, setBuyQuoteError] = useState<string | null>(null);
  const [buyGasWei, setBuyGasWei] = useState<bigint | null>(null);
  const [buyGasError, setBuyGasError] = useState<string | null>(null);
  const [buyQuoting, setBuyQuoting] = useState(false);

  const [sellQuote, setSellQuote] = useState<SellQuoteBundle | null>(null);
  const [sellQuoteError, setSellQuoteError] = useState<string | null>(null);
  const [sellGasWei, setSellGasWei] = useState<bigint | null>(null);
  const [sellQuoting, setSellQuoting] = useState(false);

  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const [capsBusy, setCapsBusy] = useState(false);
  const [capsResult, setCapsResult] = useState<{
    ok: boolean;
    summary: string;
    json: string;
  } | null>(null);

  const publicClient = useMemo(
    () => createPublicClient({ chain, transport: http(RH_RPC) }),
    [],
  );

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
      setStatus(`Refresh failed: ${String(e).slice(0, 200)}`);
    }
  }, [account, gateway, gatewayReady, publicClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep panel chain/account in sync with the live EIP-1193 provider (no forced switch).
  useEffect(() => {
    const ethereum = getEthereum() as
      | (EthereumProvider & {
          on?: (event: string, handler: (...args: unknown[]) => void) => void;
          removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
        })
      | undefined;
    if (!ethereum?.on) return;
    const onChainChanged = (hex: unknown) => {
      const n = Number.parseInt(String(hex), 16);
      if (Number.isFinite(n)) setChainId(n);
    };
    const onAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      setAccount(list[0] ? (list[0] as Address) : null);
      void ethereum.request({ method: "eth_chainId" }).then((hex) => {
        const n = Number(hex);
        if (Number.isFinite(n)) setChainId(n);
      });
    };
    ethereum.on("chainChanged", onChainChanged);
    ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      ethereum.removeListener?.("chainChanged", onChainChanged);
      ethereum.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  // --- Buy quotes (dynamic on ethIn + slippage) ---
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

  // --- Sell quotes (dynamic on balances + percent) ---
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
      setSellGasWei(null);
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
            setSellGasWei(null);
            return;
          }
          // Gas for exit only (approvals are separate prompts)
          const exit = buildExitLegs(minOutMap(q.legs));
          const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);
          const data = encodeFunctionData({
            abi: gatewayAbi,
            functionName: "exitPercentToEth",
            args: [
              BigInt(percentBps),
              exit.v3,
              exit.v2,
              exit.v4,
              q.minAmountOutEth,
              deadline,
            ],
          });
          try {
            const gas = await publicClient.estimateGas({
              account: account ?? undefined,
              to: gateway as Address,
              data,
            });
            if (cancelled) return;
            setSellGasWei(gas);
          } catch {
            // Exit gas often fails without allowances — not a hard block for quoting.
            if (cancelled) return;
            setSellGasWei(null);
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
  }, [balances, sellPercent, slippageBps, gateway, gatewayReady, publicClient, account]);

  const buyBlockReason = useMemo(() => {
    if (!gatewayReady) return "Gateway address not configured.";
    if (!account) return "Connect a wallet first.";
    // Wrong chain is not a hard block — Buy requests Robinhood 4663 on click.
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
        return `Wallet has ${formatEther(ethBalance)} ETH; need ≈ ${formatEther(need)} ETH (${formatEther(parsed.value)} buy + ≈${formatEther(gasCost)} gas at current price).`;
      }
    } else if (ethBalance !== null) {
      if (ethBalance < parsed.value) {
        return `Wallet has ${formatEther(ethBalance)} ETH; buy needs ${formatEther(parsed.value)} ETH (excluding gas).`;
      }
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
    // Wrong chain is not a hard block — Sell requests Robinhood 4663 on click.
    if (sellQuoting) return null;
    if (sellQuoteError) return sellQuoteError;
    if (!sellQuote?.quotesOk) return sellQuote?.errors.join(" · ") || "Sell quotes not ready.";
    return null;
  }, [gatewayReady, account, sellQuoting, sellQuoteError, sellQuote]);

  async function connect() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setStatus("No EIP-1193 wallet found.");
      return;
    }
    const accounts = (await ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
    setAccount(accounts[0] as Address);
    const cid = Number(await ethereum.request({ method: "eth_chainId" }));
    setChainId(cid);
    // Do not force a network switch on connect — only buy/sell request RH 4663.
  }

  async function ensureRobinhoodChain(ethereum: EthereumProvider): Promise<boolean> {
    const cid = Number(await ethereum.request({ method: "eth_chainId" }));
    setChainId(cid);
    if (cid === RH_CHAIN_ID) return true;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${RH_CHAIN_ID.toString(16)}` }],
      });
      const after = Number(await ethereum.request({ method: "eth_chainId" }));
      setChainId(after);
      if (after === RH_CHAIN_ID) return true;
      setStatus(`Still on chain ${after}; switch to Robinhood ${RH_CHAIN_ID} to continue.`);
      return false;
    } catch {
      setStatus(`Switch wallet to Robinhood Chain (${RH_CHAIN_ID}) to buy or sell.`);
      return false;
    }
  }

  /** Read-only EIP-5792 capability probe. No signatures, approvals, txs, or silent switches. */
  async function checkWalletBatching() {
    const ethereum = getEthereum();
    setCapsBusy(true);
    setCapsResult(null);
    try {
      if (!ethereum) {
        setCapsResult({
          ok: false,
          summary: "No EIP-1193 provider (window.ethereum) found.",
          json: JSON.stringify({ error: "NO_PROVIDER" }, null, 2),
        });
        return;
      }
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const addr = accounts[0] as Address;
      setAccount(addr);
      const chainHex = (await ethereum.request({ method: "eth_chainId" })) as string;
      const cid = Number(chainHex);
      setChainId(cid);
      const checkedHex = `0x${cid.toString(16)}`;
      const rhHex = `0x${RH_CHAIN_ID.toString(16)}`;
      // Check the chain the wallet is actually on — do not switch.
      let raw: unknown;
      try {
        raw = await ethereum.request({
          method: "wallet_getCapabilities",
          params: [addr, [checkedHex]],
        });
      } catch (e) {
        const err =
          e && typeof e === "object"
            ? (e as { code?: number; message?: string; data?: unknown })
            : { message: String(e) };
        setCapsResult({
          ok: false,
          summary: `wallet_getCapabilities failed on ${chainLabel(cid)} (${checkedHex}): ${err.message ?? String(e)}${
            err.code != null ? ` (code ${err.code})` : ""
          }. Read-only — no switch or trade was attempted.${
            cid !== RH_CHAIN_ID
              ? ` Basket batching needs Robinhood ${RH_CHAIN_ID}; switch manually only when you buy/sell.`
              : ""
          }`,
          json: JSON.stringify(
            {
              account: addr,
              checkedChainId: cid,
              checkedChainHex: checkedHex,
              checkedChainLabel: chainLabel(cid),
              robinhoodChainId: RH_CHAIN_ID,
              robinhoodChainHex: rhHex,
              method: "wallet_getCapabilities",
              params: [addr, [checkedHex]],
              error: err,
              silentSwitch: false,
            },
            null,
            2,
          ),
        });
        return;
      }

      const caps = raw as Record<string, { atomic?: { status?: string } }> | null;
      const atomicStatus =
        caps?.[checkedHex]?.atomic?.status ??
        caps?.[checkedHex.toLowerCase()]?.atomic?.status ??
        null;
      const honesty =
        atomicStatus === "supported" || atomicStatus === "ready"
          ? `Checked ${chainLabel(cid)} (${checkedHex}): wallet reports atomic.status="${atomicStatus}". Capability advertisement only — not proven wallet_sendCalls execution.`
          : atomicStatus
            ? `Checked ${chainLabel(cid)} (${checkedHex}): atomic.status="${atomicStatus}". Not proven execution.`
            : `Checked ${chainLabel(cid)} (${checkedHex}): no atomic capability returned for this account/chain.`;

      setCapsResult({
        ok: true,
        summary:
          honesty +
          (cid !== RH_CHAIN_ID
            ? ` (Wallet is not on Robinhood ${RH_CHAIN_ID}; buy/sell will ask to switch then.)`
            : ""),
        json: JSON.stringify(
          {
            account: addr,
            checkedChainId: cid,
            checkedChainHex: checkedHex,
            checkedChainLabel: chainLabel(cid),
            robinhoodChainId: RH_CHAIN_ID,
            robinhoodChainHex: rhHex,
            method: "wallet_getCapabilities",
            params: [addr, [checkedHex]],
            capabilities: raw,
            atomicStatus,
            silentSwitch: false,
            interpretation:
              "READ_ONLY_CAPABILITY_CHECK — not wallet_sendCalls, not a trade, not proven execution",
          },
          null,
          2,
        ),
      });
    } catch (e) {
      setCapsResult({
        ok: false,
        summary: `Unexpected error: ${String(e).slice(0, 240)}`,
        json: JSON.stringify({ error: String(e) }, null, 2),
      });
    } finally {
      setCapsBusy(false);
    }
  }

  async function buy() {
    const ethereum = getEthereum();
    if (!ethereum || !account || !gatewayReady || !gateway) return;
    if (buyBlockReason) {
      setStatus(`Buy blocked: ${buyBlockReason}`);
      return;
    }
    const parsed = parseEthInput(ethIn);
    if (!parsed.ok || !buyQuote) return;

    setBusy(true);
    setStatus("");
    try {
      if (!(await ensureRobinhoodChain(ethereum))) return;
      const wallet = createWalletClient({
        account,
        chain,
        transport: custom(ethereum),
      });
      // Fresh quote at send time
      const fresh = await quoteBuyLegs({
        client: publicClient,
        grossEth: parsed.value,
        slippageBps,
      });
      if (!fresh.quotesOk) {
        setStatus(`Buy blocked: ${fresh.errors.join(" · ")}`);
        return;
      }
      const legs = buildBuyLegs(minOutMap(fresh.legs));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);
      setPromptCount((n) => n + 1);
      const hash = await wallet.writeContract({
        address: gateway as Address,
        abi: gatewayAbi,
        functionName: "depositFromEth",
        args: [legs.v3, legs.v2, legs.v4, deadline],
        value: parsed.value,
        account,
        chain,
      });
      setStatus(`Buy submitted (1 confirmation): ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
      await refresh();
      setStatus(`Buy confirmed: ${hash} — tokens are in your wallet`);
    } catch (e) {
      setStatus(`Buy failed: ${String(e).slice(0, 300)}`);
    } finally {
      setBusy(false);
    }
  }

  async function sellSequentialCold() {
    await sellBasket({ mode: "sequential-allowed" });
  }

  /**
   * Gate A live path: wallet_sendCalls with atomicRequired only.
   * No silent fallback to 8× approve + exit sequential confirms.
   */
  async function sellAtomicGateA50() {
    await sellBasket({ mode: "atomic-only", forcePercent: 50 });
  }

  async function sellAtomicGateA100() {
    await sellBasket({ mode: "atomic-only", forcePercent: 100 });
  }

  async function sellBasket(opts: {
    mode: "atomic-only" | "sequential-allowed";
    forcePercent?: number;
  }) {
    const ethereum = getEthereum();
    if (!ethereum || !account || !gatewayReady || !gateway) return;
    if (sellBlockReason && opts.mode === "sequential-allowed") {
      setStatus(`Sell blocked: ${sellBlockReason}`);
      return;
    }
    // Gate A atomic path: only require connect + gateway; quotes refreshed below.
    if (opts.mode === "atomic-only") {
      if (!account) {
        setStatus("Gate A blocked: connect wallet first.");
        return;
      }
      if (!gatewayReady) {
        setStatus("Gate A blocked: gateway not configured.");
        return;
      }
    }
    setBusy(true);
    setStatus("");
    try {
      if (!(await ensureRobinhoodChain(ethereum))) return;
      const wallet = createWalletClient({
        account,
        chain,
        transport: custom(ethereum),
      });
      const pct = opts.forcePercent ?? sellPercent;
      const percentBps = Math.min(100, Math.max(1, pct)) * 100;
      const amountIns: Record<string, bigint> = {};
      for (const row of balances) {
        amountIns[row.symbol] = (row.raw * BigInt(percentBps)) / BigInt(10_000);
      }
      const hasAny = Object.values(amountIns).some((v) => v > BigInt(0));
      if (!hasAny) {
        setStatus(
          "Sell blocked: no basket token balances. Buy first, then retry Gate A atomic sell.",
        );
        return;
      }

      const fresh = await quoteSellLegs({
        client: publicClient,
        amountIns,
        slippageBps,
      });
      if (!fresh.quotesOk) {
        setStatus(`Sell blocked: ${fresh.errors.join(" · ")}`);
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

      const chainKey = `0x${RH_CHAIN_ID.toString(16)}`;
      const tryAtomic = async (): Promise<boolean> => {
        const caps = (await ethereum.request({
          method: "wallet_getCapabilities",
          params: [account, [chainKey]],
        })) as Record<string, { atomic?: { status?: string } }>;
        const atomic =
          caps?.[chainKey]?.atomic?.status ??
          caps?.[chainKey.toLowerCase()]?.atomic?.status ??
          null;
        if (atomic !== "supported" && atomic !== "ready") {
          if (opts.mode === "atomic-only") {
            setStatus(
              `Gate A FAIL: atomic.status=${JSON.stringify(atomic)} on ${chainKey}. Capability discovery did not advertise ready/supported — not attempting sequential fallback.`,
            );
            return true; // handled
          }
          return false;
        }

        const calls =
          needsApprove.length > 0
            ? [
                ...needsApprove.map((t) => ({
                  to: t.address,
                  data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [gateway as Address, maxUint256],
                  }),
                  value: "0x0",
                })),
                {
                  to: gateway as Address,
                  data: exitData,
                  value: "0x0",
                },
              ]
            : [
                {
                  to: gateway as Address,
                  data: exitData,
                  value: "0x0",
                },
              ];

        const ethBefore = await publicClient.getBalance({ address: account });
        setPromptCount((n) => n + 1);
        setStatus(
          `Gate A: requesting wallet_sendCalls (${calls.length} calls, atomicRequired=true, atomic.status=${atomic}, sell=${pct}%). Approve the wallet prompt(s). “ready” ≠ proven execution.`,
        );
        const batch = (await ethereum.request({
          method: "wallet_sendCalls",
          params: [
            {
              version: "2.0.0",
              from: account,
              chainId: chainKey,
              atomicRequired: true,
              calls,
            },
          ],
        })) as { id?: string } | string;
        const batchId =
          typeof batch === "string"
            ? batch
            : batch?.id ?? JSON.stringify(batch).slice(0, 120);

        // Poll getCallsStatus when available
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

        await refresh();
        const ethAfter = await publicClient.getBalance({ address: account });
        const returned = ethAfter > ethBefore ? ethAfter - ethBefore : BigInt(0);
        setStatus(
          [
            `Gate A wallet_sendCalls submitted.`,
            `atomic.status(capability)=${atomic}`,
            `batchId=${batchId}`,
            `calls=${calls.length} (approves=${needsApprove.length}, exit=1)`,
            `sellPercent=${pct}`,
            `minOutEth=${formatEther(fresh.minAmountOutEth)}`,
            `ETH before=${formatEther(ethBefore)} after=${formatEther(ethAfter)} delta≈${formatEther(returned)} (gas may reduce delta)`,
            `getCallsStatus=${statusJson ? JSON.stringify(statusJson).slice(0, 500) : "n/a"}`,
            `Honesty: capability “ready” is not execution proof — record receipts from wallet/explorer.`,
          ].join("\n"),
        );
        return true;
      };

      try {
        const handled = await tryAtomic();
        if (handled) return;
      } catch (e) {
        if (opts.mode === "atomic-only") {
          setStatus(
            `Gate A FAIL (no sequential fallback): ${String(e).slice(0, 400)}`,
          );
          return;
        }
        // sequential-allowed: fall through
        setStatus(
          `Atomic batch unavailable (${String(e).slice(0, 120)}); falling back to sequential…`,
        );
      }

      if (opts.mode === "atomic-only") {
        setStatus(
          "Gate A FAIL: atomic path did not run. No sequential fallback by design.",
        );
        return;
      }

      let prompts = 0;
      for (const t of needsApprove) {
        prompts += 1;
        setPromptCount((n) => n + 1);
        const h = await wallet.writeContract({
          address: t.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [gateway as Address, maxUint256],
          account,
          chain,
        });
        await publicClient.waitForTransactionReceipt({ hash: h as Hex });
      }

      prompts += 1;
      setPromptCount((n) => n + 1);
      const hash = await wallet.writeContract({
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
        account,
        chain,
      });
      setStatus(
        `Sell submitted after ${prompts} confirmation(s) this session (cold path up to 9 on ordinary wallets). Hash: ${hash}`,
      );
      await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
      await refresh();
      setStatus(`Sell confirmed: ${hash}`);
    } catch (e) {
      setStatus(`Sell failed: ${String(e).slice(0, 300)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 text-[var(--foreground)]">
      <header className="flex flex-col gap-3">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">INDEXLA Core</p>
        <h1 className="text-3xl font-semibold tracking-tight">Utility Index</h1>
        <div className="rounded border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-sm leading-relaxed text-zinc-300">
          <p className="font-medium text-zinc-100">Direct ownership — eight tokens in your wallet</p>
          <p className="mt-1">
            Choose any buy amount. Quotes and gas update live. Slippage floors apply on every
            active leg (PRISM FoT + PROLOGUE V4 included).
          </p>
        </div>
      </header>

      <section className="rounded border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
        <p className="font-medium">Unresolved blocker (ownership model unchanged)</p>
        <p className="mt-1 text-amber-200/90">{PROMPT_INVENTORY.blocker}</p>
        <ul className="mt-2 list-disc pl-5 text-amber-200/80">
          <li>Buy: {PROMPT_INVENTORY.buy} confirmation ✓ (≤{PROMPT_INVENTORY.maxAllowed})</li>
          <li>
            First cold sell: {PROMPT_INVENTORY.firstSellCold} confirmations ✗ (target ≤
            {PROMPT_INVENTORY.maxAllowed})
          </li>
          <li>Warm sell (allowances already set): {PROMPT_INVENTORY.repeatSellWarm} confirmation</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 border-t border-zinc-800 pt-6 text-sm">
        <h2 className="text-lg font-medium text-zinc-100">Gateway</h2>
        {gatewayReady ? (
          <a
            className="font-mono text-xs text-sky-400 underline break-all"
            href={`${RH_EXPLORER}/address/${gateway}`}
            target="_blank"
            rel="noreferrer"
          >
            {gateway}
          </a>
        ) : (
          <p className="text-amber-300">
            Set <code className="text-amber-100">NEXT_PUBLIC_INDEXLA_GATEWAY_4663</code> after
            deploying <code className="text-amber-100">IndexlaGateway4663</code>.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-zinc-800 pt-6">
        <h2 className="text-lg font-medium">Wallet</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900"
          >
            {account ? "Reconnect" : "Connect wallet"}
          </button>
          <button
            type="button"
            disabled={capsBusy}
            onClick={() => void checkWalletBatching()}
            className="rounded border border-sky-600/60 bg-sky-950/40 px-4 py-2 text-sm font-medium text-sky-100 disabled:opacity-40"
          >
            {capsBusy ? "Checking…" : "Check wallet batching"}
          </button>
          {account && (
            <span className="font-mono text-sm text-zinc-300">
              {account.slice(0, 6)}…{account.slice(-4)} · {chainLabel(chainId)}
              {ethBalance !== null ? ` · ${formatEther(ethBalance)} ETH` : ""}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Connect stays on your current chain. Buy/sell ask for Robinhood (4663) only when needed.
          Batching check uses the connected wallet on whatever chain you are on — no silent switch.
          A “ready” status is not proven execution.
        </p>
        {capsResult && (
          <div
            className={`rounded border px-3 py-3 text-sm ${
              capsResult.ok
                ? "border-zinc-600 bg-zinc-950/80 text-zinc-200"
                : "border-amber-700/60 bg-amber-950/30 text-amber-100"
            }`}
          >
            <p className="font-medium">{capsResult.summary}</p>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 p-2 font-mono text-[11px] text-zinc-300">
              {capsResult.json}
            </pre>
            <button
              type="button"
              className="mt-2 text-sm text-sky-400 underline"
              onClick={() => void navigator.clipboard.writeText(capsResult.json)}
            >
              Copy JSON
            </button>
          </div>
        )}
        <label className="text-sm text-zinc-400">
          Slippage (bps)
          <input
            type="number"
            min={1}
            max={2000}
            className="ml-2 w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono"
            value={slippageBps}
            onChange={(e) => setSlippageBps(Math.min(2000, Math.max(1, Number(e.target.value) || 1)))}
          />
          <span className="ml-2 text-zinc-500">
            V2 legs add +50 bps; multi-leg sell total adds +200 bps
          </span>
        </label>
        <p className="text-sm text-zinc-500">Session wallet prompts counted: {promptCount}</p>
      </section>

      <section className="flex flex-col gap-4 border-t border-zinc-800 pt-6">
        <h2 className="text-lg font-medium">Tokens you own (in your wallet)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-3">Token</th>
                <th className="py-1 pr-3">Balance</th>
                <th className="py-1">Gateway allowance</th>
              </tr>
            </thead>
            <tbody>
              {BASKET.map((t) => {
                const row = balances.find((b) => b.symbol === t.symbol);
                return (
                  <tr key={t.symbol} className="border-t border-zinc-900">
                    <td className="py-2 pr-3">
                      {t.symbol}{" "}
                      <span className="text-zinc-500">({(t.weightBps / 100).toFixed(0)}%)</span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{row?.amount ?? "—"}</td>
                    <td className="py-2 text-xs">
                      {row && row.allowance > BigInt(0) ? "set" : "none"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="self-start text-sm text-sky-400 underline"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </section>

      {gatewayReady && (
        <>
          <section className="flex flex-col gap-4 border-t border-zinc-800 pt-6">
            <h2 className="text-lg font-medium">Buy · 1 confirmation → 8 tokens to your wallet</h2>
            <label className="text-sm text-zinc-400">
              ETH amount (your choice)
              <input
                className="mt-1 w-48 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono"
                value={ethIn}
                placeholder="e.g. 0.005"
                onChange={(e) => setEthIn(e.target.value)}
              />
            </label>
            <div className="text-xs text-zinc-400 space-y-1 font-mono">
              {buyQuoting && <p>Quoting…</p>}
              {buyQuote?.quotesOk && (
                <>
                  <p>
                    Active legs: {buyQuote.activeLegCount}/8 · investable after 100 bps fee:{" "}
                    {formatEther(buyQuote.investableEth)} ETH
                  </p>
                  {buyQuote.legs.map((l) => (
                    <p key={l.symbol}>
                      {l.symbol}: in {formatEther(l.amountIn)} ETH → minOut{" "}
                      {formatUnits(l.amountOutMinimum, 18)}
                    </p>
                  ))}
                  {buyGasWei !== null && (
                    <p>
                      Est. gas units: {buyGasWei.toString()}
                      {gasPrice !== null
                        ? ` · ≈${formatEther(buyGasWei * gasPrice)} ETH fee`
                        : " (wallet will show fee)"}
                    </p>
                  )}
                  {Object.keys(buyQuote.taxNotes).length > 0 && (
                    <p>{JSON.stringify(buyQuote.taxNotes)}</p>
                  )}
                </>
              )}
              {buyBlockReason && (
                <p className="text-amber-300 whitespace-pre-wrap">Blocked: {buyBlockReason}</p>
              )}
            </div>
            <button
              type="button"
              disabled={busy || !account || Boolean(buyBlockReason) || buyQuoting}
              onClick={() => void buy()}
              className="w-fit rounded bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            >
              Buy basket
            </button>
          </section>

          <section className="flex flex-col gap-4 border-t border-zinc-800 pt-6">
            <h2 className="text-lg font-medium">Sell → native ETH</h2>
            <p className="text-sm text-zinc-400">
              Ordinary-wallet cold path can be up to {PROMPT_INVENTORY.firstSellCold} prompts (not
              ≤{PROMPT_INVENTORY.maxAllowed}). Quotes refresh with your balances and percent.
            </p>
            <label className="text-sm text-zinc-400">
              Percent: {sellPercent}%
              <input
                type="range"
                min={1}
                max={100}
                value={sellPercent}
                onChange={(e) => setSellPercent(Number(e.target.value))}
                className="mt-2 block w-full max-w-md"
              />
            </label>
            <div className="text-xs text-zinc-400 space-y-1 font-mono">
              {sellQuoting && <p>Quoting sell…</p>}
              {sellQuote?.quotesOk && (
                <>
                  <p>
                    Quoted gross ≈ {formatEther(sellQuote.quotedGrossEth)} ETH · min net to you:{" "}
                    {formatEther(sellQuote.minAmountOutEth)} ETH
                  </p>
                  {sellGasWei !== null && (
                    <p>Est. exit gas units: {sellGasWei.toString()} (approvals extra if cold)</p>
                  )}
                </>
              )}
              {sellBlockReason && (
                <p className="text-amber-300 whitespace-pre-wrap">Blocked: {sellBlockReason}</p>
              )}
            </div>
            <button
              type="button"
              disabled={busy || !account || Boolean(sellBlockReason) || sellQuoting}
              onClick={() => void sellSequentialCold()}
              className="w-fit rounded border border-zinc-600 px-5 py-2.5 text-sm font-semibold text-zinc-200 disabled:opacity-40"
            >
              Sell {sellPercent}% (sequential · may be up to 9 prompts)
            </button>
            <button
              type="button"
              disabled={busy || !account}
              onClick={() => void sellAtomicGateA50()}
              className="w-fit rounded bg-sky-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            >
              Gate A · Sell 50% atomic only (wallet_sendCalls)
            </button>
            <button
              type="button"
              disabled={busy || !account}
              onClick={() => void sellAtomicGateA100()}
              className="w-fit rounded border border-sky-500 px-5 py-2.5 text-sm font-semibold text-sky-100 disabled:opacity-40"
            >
              Gate A · Sell 100% remainder atomic only
            </button>
            <p className="text-xs text-zinc-500 max-w-xl">
              Gate A buttons force atomicRequired wallet_sendCalls (approvals + exit together). They
              do not fall back to nine sequential confirms. Capability “ready” is discovery only —
              not proven execution until receipts land.
            </p>
          </section>
        </>
      )}

      {status && (
        <section className="border-t border-zinc-800 pt-6 text-sm text-amber-200">{status}</section>
      )}
    </div>
  );
}
