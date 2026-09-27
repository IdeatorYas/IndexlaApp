"use client";

import { useCallback, useEffect, useState } from "react";
import {
  VersionedTransaction,
  type Connection,
} from "@solana/web3.js";
import {
  BUY_CONFIRM_MAX,
  DEFAULT_SLIPPAGE_BPS,
  DEGEN_SOLANA_BASKET,
  SELL_CONFIRM_MAX,
  splitLegsIntoSignBatches,
  type DegenSolanaMintKey,
} from "@/lib/degen-solana/constants";
import {
  clearCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
  type CheckpointLeg,
  type DegenSolanaCheckpoint,
} from "@/lib/degen-solana/checkpoint";
import { dustThresholdRaw } from "@/lib/degen-solana/balances";
import { useSolanaWallet } from "@/components/degen-club/SolanaWalletProvider";

type QuoteLeg = {
  key: DegenSolanaMintKey;
  ticker: string;
  mint: string;
  amountIn: string;
  quote: Record<string, unknown>;
  impactPct: number;
  impactSoft: boolean;
  feeAccount?: string;
};

type QuoteResponse = {
  side: "buy" | "sell";
  slippageBps: number;
  platformFeeBps: number;
  feeConfigured: boolean;
  feeMissing?: string[];
  rentReserveLamports?: string;
  investableLamports?: string;
  legs: QuoteLeg[];
  error?: string;
};

export type ExecProgress = {
  phase: string;
  confirmCount: number;
  confirmMax: number;
  legs: Array<{
    key: string;
    ticker: string;
    status: string;
    signature?: string;
    error?: string;
  }>;
};

function decodeSwapTx(base64: string): VersionedTransaction {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return VersionedTransaction.deserialize(bytes);
}

async function confirmSignature(
  connection: Connection,
  signature: string,
  lastValidBlockHeight?: number,
): Promise<void> {
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight:
        lastValidBlockHeight ?? latest.lastValidBlockHeight,
    },
    "confirmed",
  );
}

export function useSolanaMemeBasket() {
  const wallet = useSolanaWallet();
  const [balances, setBalances] = useState<{
    solUi: number;
    solLamports: string;
    tokens: Array<{
      key: string;
      ticker: string;
      mint: string;
      amount: string;
      uiAmount: number;
    }>;
    feeConfigured: boolean;
  } | null>(null);
  const [progress, setProgress] = useState<ExecProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshBalances = useCallback(async () => {
    if (!wallet.publicKey) {
      setBalances(null);
      return;
    }
    const res = await fetch(
      `/api/degen-solana/balances?owner=${encodeURIComponent(wallet.publicKey)}`,
    );
    const json = (await res.json()) as {
      error?: string;
      solUi?: number;
      solLamports?: string;
      feeConfigured?: boolean;
      tokens?: Array<{
        key: string;
        ticker: string;
        mint: string;
        amount: string;
        uiAmount: number;
      }>;
    };
    if (!res.ok) throw new Error(json.error ?? "Balance fetch failed");
    setBalances({
      solUi: json.solUi ?? 0,
      solLamports: json.solLamports ?? "0",
      tokens: json.tokens ?? [],
      feeConfigured: Boolean(json.feeConfigured),
    });
  }, [wallet.publicKey]);

  useEffect(() => {
    void refreshBalances().catch(() => undefined);
  }, [refreshBalances]);

  const runSide = useCallback(
    async (params: {
      side: "buy" | "sell";
      solLamports?: string;
      slippageBps?: number;
      onlyKeys?: string[];
      resume?: boolean;
      weightsPct?: number[];
    }) => {
      setBusy(true);
      setError(null);
      let confirmCount = 0;
      const confirmMax =
        params.side === "buy" ? BUY_CONFIRM_MAX : SELL_CONFIRM_MAX;

      try {
        let pubkey = wallet.publicKey;
        if (!pubkey) {
          pubkey = await wallet.connect();
          confirmCount += 1;
        }

        let sellAmounts: Record<string, string> | undefined;
        if (params.side === "sell") {
          const balRes = await fetch(
            `/api/degen-solana/balances?owner=${encodeURIComponent(pubkey)}`,
          );
          const balJson = (await balRes.json()) as {
            tokens?: Array<{
              key: string;
              mint: string;
              amount: string;
              decimals?: number;
            }>;
            error?: string;
          };
          if (!balRes.ok) throw new Error(balJson.error ?? "balances failed");
          sellAmounts = {};
          for (const t of balJson.tokens ?? []) {
            const mintMeta = DEGEN_SOLANA_BASKET.find((m) => m.mint === t.mint);
            const dust = dustThresholdRaw(mintMeta?.decimals ?? 6);
            if (BigInt(t.amount) <= dust) continue;
            if (params.onlyKeys && !params.onlyKeys.includes(t.key)) continue;
            sellAmounts[t.mint] = t.amount;
          }
          if (Object.keys(sellAmounts).length === 0) {
            throw new Error("No basket token balances to sell");
          }
        }

        setProgress({
          phase: "Preparing transaction…",
          confirmCount,
          confirmMax,
          legs: [],
        });

        const quoteRes = await fetch("/api/degen-solana/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            side: params.side,
            solLamports: params.solLamports,
            sellAmounts,
            slippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
            onlyKeys: params.onlyKeys,
            weightsPct: params.weightsPct,
          }),
        });
        const quoteJson = (await quoteRes.json()) as QuoteResponse & {
          error?: string;
        };
        if (!quoteRes.ok) {
          throw new Error(quoteJson.error ?? "Quote failed");
        }

        const cp: DegenSolanaCheckpoint = {
          intentId: `${params.side}-${Date.now()}`,
          side: params.side,
          wallet: pubkey,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          confirmCount,
          legs: quoteJson.legs.map(
            (l): CheckpointLeg => ({
              key: l.key,
              mint: l.mint,
              amountIn: l.amountIn,
              status: "pending",
            }),
          ),
        };
        saveCheckpoint(cp);

        const batches = splitLegsIntoSignBatches(quoteJson.legs);
        const legResults: ExecProgress["legs"] = quoteJson.legs.map((l) => ({
          key: l.key,
          ticker: l.ticker,
          status: "pending",
        }));

        for (let bi = 0; bi < batches.length; bi += 1) {
          const batch = batches[bi]!;
          setProgress({
            phase: "Preparing transaction…",
            confirmCount,
            confirmMax,
            legs: [...legResults],
          });

          const txs: VersionedTransaction[] = [];
          const batchMeta: QuoteLeg[] = [];
          const blockHeights: Array<number | undefined> = [];
          for (const leg of batch) {
            const swapRes = await fetch("/api/degen-solana/swap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userPublicKey: pubkey,
                quoteResponse: leg.quote,
                feeAccount: leg.feeAccount,
              }),
            });
            const swapJson = (await swapRes.json()) as {
              swapTransaction?: string;
              lastValidBlockHeight?: number;
              error?: string;
            };
            if (!swapRes.ok || !swapJson.swapTransaction) {
              throw new Error(
                swapJson.error ?? `Swap build failed for ${leg.ticker}`,
              );
            }
            txs.push(decodeSwapTx(swapJson.swapTransaction));
            batchMeta.push(leg);
            blockHeights.push(swapJson.lastValidBlockHeight);
          }

          setProgress({
            phase: "Confirm in wallet…",
            confirmCount,
            confirmMax,
            legs: [...legResults],
          });

          if (confirmCount >= confirmMax) {
            throw new Error(
              `Would exceed ${confirmMax} wallet confirms — aborting remaining legs. Use Finish to resume.`,
            );
          }

          // Prefer Phantom-native send when batch is a single leg; otherwise
          // signAll then broadcast through the same-origin RPC proxy.
          let signatures: string[] = [];
          if (txs.length === 1) {
            const sig = await wallet.signAndSendTransaction(txs[0]!);
            signatures = [sig];
            confirmCount += 1;
          } else {
            const signed = await wallet.signAllTransactions(txs);
            confirmCount += 1;
            setProgress({
              phase: "Sending transaction…",
              confirmCount,
              confirmMax,
              legs: [...legResults],
            });
            for (let i = 0; i < signed.length; i += 1) {
              const raw = signed[i]!.serialize();
              const sig = await wallet.connection.sendRawTransaction(raw, {
                skipPreflight: false,
                maxRetries: 3,
              });
              signatures.push(sig);
            }
          }
          cp.confirmCount = confirmCount;
          saveCheckpoint(cp);

          setProgress({
            phase: "Confirming on-chain…",
            confirmCount,
            confirmMax,
            legs: [...legResults],
          });

          for (let i = 0; i < signatures.length; i += 1) {
            const leg = batchMeta[i]!;
            const idx = legResults.findIndex((x) => x.key === leg.key);
            try {
              await confirmSignature(
                wallet.connection,
                signatures[i]!,
                blockHeights[i],
              );
              if (idx >= 0) {
                legResults[idx] = {
                  key: leg.key,
                  ticker: leg.ticker,
                  status: "confirmed",
                  signature: signatures[i],
                };
              }
              const cpLeg = cp.legs.find((l) => l.key === leg.key);
              if (cpLeg) {
                cpLeg.status = "confirmed";
                cpLeg.signature = signatures[i];
              }
              saveCheckpoint(cp);
            } catch (sendErr) {
              const msg =
                sendErr instanceof Error ? sendErr.message : String(sendErr);
              if (idx >= 0) {
                legResults[idx] = {
                  key: leg.key,
                  ticker: leg.ticker,
                  status: "failed",
                  error: msg,
                  signature: signatures[i],
                };
              }
              const cpLeg = cp.legs.find((l) => l.key === leg.key);
              if (cpLeg) {
                cpLeg.status = "failed";
                cpLeg.error = msg;
                cpLeg.signature = signatures[i];
              }
              saveCheckpoint(cp);
              throw new Error(
                `${leg.ticker} failed after wallet approval: ${msg}`,
              );
            }
          }
        }

        const failed = legResults.filter((l) => l.status === "failed");
        const confirmed = legResults.filter((l) => l.status === "confirmed");
        if (failed.length === 0 && confirmed.length === legResults.length) {
          clearCheckpoint(pubkey, params.side);
        }

        setProgress({
          phase:
            failed.length === 0
              ? params.side === "buy"
                ? "Buy complete"
                : "Sell All complete"
              : `Partial — ${failed.length} leg(s) failed.`,
          confirmCount,
          confirmMax,
          legs: legResults,
        });
        await refreshBalances();
        return { confirmCount, legs: legResults };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [refreshBalances, wallet],
  );

  const buy = useCallback(
    (solLamports: string, slippageBps?: number, weightsPct?: number[]) =>
      runSide({ side: "buy", solLamports, slippageBps, weightsPct }),
    [runSide],
  );

  const sellAll = useCallback(
    (slippageBps?: number) => runSide({ side: "sell", slippageBps }),
    [runSide],
  );

  const finishIncomplete = useCallback(
    async (side: "buy" | "sell") => {
      if (!wallet.publicKey) await wallet.connect();
      const pk = wallet.publicKey;
      if (!pk) throw new Error("Connect Solana wallet first");
      const cp = loadCheckpoint(pk, side);
      const onlyKeys = cp
        ? cp.legs
            .filter((l) => l.status !== "confirmed")
            .map((l) => l.key)
        : undefined;
      if (side === "buy") {
        throw new Error(
          "Finish buy: re-enter SOL amount for remaining sleeves (partial buy resume uses Sell-style onlyKeys — use Buy with remaining SOL).",
        );
      }
      return runSide({
        side: "sell",
        onlyKeys: onlyKeys?.length ? onlyKeys : undefined,
        resume: true,
      });
    },
    [runSide, wallet],
  );

  return {
    wallet,
    balances,
    refreshBalances,
    progress,
    error,
    busy,
    buy,
    sellAll,
    finishIncomplete,
    basket: DEGEN_SOLANA_BASKET,
  };
}
