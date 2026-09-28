"use client";

import { useCallback, useEffect, useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import {
  BUY_CONFIRM_MAX,
  DEFAULT_SLIPPAGE_BPS,
  DEGEN_SOLANA_BASKET,
  SELL_CONFIRM_MAX,
  SIGN_BATCH_MAX,
  splitLegsIntoSignBatches,
  type DegenSolanaMintKey,
} from "@/lib/degen-solana/constants";
import {
  clearCheckpoint,
  loadCheckpoint,
  mergeCheckpointLegs,
  saveCheckpoint,
  submittedLegs,
  unfinishedLegs,
  type CheckpointLeg,
  type DegenSolanaCheckpoint,
} from "@/lib/degen-solana/checkpoint";
import { dustThresholdRaw } from "@/lib/degen-solana/balances";
import { confirmSignatureHttp } from "@/lib/degen-solana/confirm";
import {
  decodeSwapTxBase64,
  restampVersionedTx,
} from "@/lib/degen-solana/restamp";
import { useSolanaWallet } from "@/components/degen-club/SolanaWalletProvider";

type QuoteLeg = {
  key: DegenSolanaMintKey;
  ticker: string;
  mint: string;
  amountIn: string;
  quote: Record<string, unknown> & {
    otherAmountThreshold?: string;
    outAmount?: string;
  };
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

type BuiltSwapLeg = {
  key: string;
  ticker?: string;
  mint: string;
  swapTransaction: string;
};

export type ExecProgress = {
  phase: string;
  confirmCount: number;
  confirmMax: number;
  /** Confirmed legs this run (not wallet inventory). */
  heldCount: number;
  basketSize: number;
  legs: Array<{
    key: string;
    ticker: string;
    status: string;
    signature?: string;
    error?: string;
  }>;
};

function signatureFromSignedTx(tx: VersionedTransaction): string {
  const sig = tx.signatures[0];
  if (!sig || sig.every((b) => b === 0)) {
    throw new Error("Signed transaction missing signature");
  }
  return bs58.encode(sig);
}

function tickerForKey(key: string): string {
  return DEGEN_SOLANA_BASKET.find((m) => m.key === key)?.ticker ?? key;
}

function minOutForLeg(leg: QuoteLeg): bigint {
  const raw =
    leg.quote.otherAmountThreshold ?? leg.quote.outAmount ?? "0";
  try {
    return BigInt(String(raw));
  } catch {
    return BigInt(0);
  }
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
      ataExists?: boolean;
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
      solUi?: number;
      solLamports?: string;
      tokens?: Array<{
        key: string;
        ticker: string;
        mint: string;
        amount: string;
        uiAmount: number;
        ataExists?: boolean;
      }>;
      feeConfigured?: boolean;
      error?: string;
    };
    if (!res.ok) throw new Error(json.error ?? "balances failed");
    setBalances({
      solUi: json.solUi ?? 0,
      solLamports: json.solLamports ?? "0",
      tokens: json.tokens ?? [],
      feeConfigured: Boolean(json.feeConfigured),
    });
  }, [wallet.publicKey]);

  useEffect(() => {
    if (wallet.publicKey) {
      void refreshBalances().catch(() => undefined);
    } else {
      setBalances(null);
    }
  }, [wallet.publicKey, refreshBalances]);

  const heldNonDustCount = useCallback(
    (
      tokens: Array<{ key: string; mint: string; amount: string }>,
      onlyKeys?: string[],
    ) => {
      const keys = onlyKeys
        ? new Set(onlyKeys)
        : new Set(DEGEN_SOLANA_BASKET.map((m) => m.key));
      let n = 0;
      for (const t of tokens) {
        if (!keys.has(t.key)) continue;
        const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === t.key);
        if (BigInt(t.amount) > dustThresholdRaw(meta?.decimals ?? 6)) n += 1;
      }
      return n;
    },
    [],
  );

  const runSide = useCallback(
    async (params: {
      side: "buy" | "sell";
      solLamports?: string;
      slippageBps?: number;
      onlyKeys?: string[];
      resume?: boolean;
      weightsPct?: number[];
      /** Preserve this checkpoint identity on finish (do not invent a new intent). */
      existingCheckpoint?: DegenSolanaCheckpoint;
    }) => {
      setBusy(true);
      setError(null);
      setProgress(null);
      let confirmCount = 0;
      const confirmMax =
        params.side === "buy" ? BUY_CONFIRM_MAX : SELL_CONFIRM_MAX;
      const basketSize = DEGEN_SOLANA_BASKET.length;

      try {
        let pubkey = wallet.publicKey;
        if (!pubkey) {
          // Connect does not count toward the ≤4 sign budget.
          pubkey = await wallet.connect();
        }

        let sellAmounts: Record<string, string> | undefined;
        let baselineByKey: Record<string, string> = {};

        const balRes = await fetch(
          `/api/degen-solana/balances?owner=${encodeURIComponent(pubkey)}`,
        );
        const balJson = (await balRes.json()) as {
          tokens?: Array<{
            key: string;
            mint: string;
            amount: string;
            decimals?: number;
            ataExists?: boolean;
          }>;
          error?: string;
        };
        if (!balRes.ok) throw new Error(balJson.error ?? "balances failed");
        for (const t of balJson.tokens ?? []) {
          baselineByKey[t.key] = t.amount;
        }

        // Skip sleeves already filled above dust on a fresh buy (don't rebuy).
        let onlyKeys = params.onlyKeys;
        let weightsPct = params.weightsPct;
        if (params.side === "buy" && !onlyKeys) {
          const already = (balJson.tokens ?? []).filter((t) => {
            const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === t.key);
            return BigInt(t.amount) > dustThresholdRaw(meta?.decimals ?? 6);
          });
          if (already.length > 0 && already.length < basketSize) {
            const held = new Set(already.map((t) => t.key));
            onlyKeys = DEGEN_SOLANA_BASKET.map((m) => m.key).filter(
              (k) => !held.has(k),
            );
            if (weightsPct && weightsPct.length === basketSize) {
              const raw = onlyKeys.map((k) => {
                const i = DEGEN_SOLANA_BASKET.findIndex((m) => m.key === k);
                return i >= 0 ? weightsPct![i]! : 0;
              });
              const sum = raw.reduce((a, b) => a + b, 0);
              if (sum > 0) {
                weightsPct = raw.map((w) => Math.round((w / sum) * 100));
                const drift = 100 - weightsPct.reduce((a, b) => a + b, 0);
                if (drift !== 0 && weightsPct.length > 0) {
                  weightsPct[0] = weightsPct[0]! + drift;
                }
              }
            }
          } else if (already.length === basketSize) {
            throw new Error(
              "Wallet already holds all 10 basket assets. Use Sell All, or Finish remaining if a prior buy is incomplete.",
            );
          }
        }

        if (params.side === "sell") {
          sellAmounts = {};
          for (const t of balJson.tokens ?? []) {
            const mintMeta = DEGEN_SOLANA_BASKET.find((m) => m.mint === t.mint);
            const dust = dustThresholdRaw(mintMeta?.decimals ?? 6);
            if (BigInt(t.amount) <= dust) continue;
            if (onlyKeys && !onlyKeys.includes(t.key)) continue;
            sellAmounts[t.mint] = t.amount;
          }
          if (Object.keys(sellAmounts).length === 0) {
            throw new Error("No basket token balances to sell");
          }
        }

        const existingAtaKeys = (balJson.tokens ?? [])
          .filter((t) => t.ataExists || BigInt(t.amount) > BigInt(0))
          .map((t) => t.key);

        setProgress({
          phase: "Preparing transaction…",
          confirmCount,
          confirmMax,
          heldCount: 0,
          basketSize,
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
            onlyKeys,
            weightsPct,
            existingAtaKeys,
          }),
        });
        const quoteJson = (await quoteRes.json()) as QuoteResponse & {
          error?: string;
        };
        if (!quoteRes.ok) {
          throw new Error(quoteJson.error ?? "Quote failed");
        }

        const intendedKeys = quoteJson.legs.map((l) => l.key);
        const fullIntended =
          params.existingCheckpoint?.intendedKeys ??
          (params.side === "buy" && !onlyKeys
            ? DEGEN_SOLANA_BASKET.map((m) => m.key)
            : intendedKeys);

        let cp: DegenSolanaCheckpoint;
        if (params.existingCheckpoint) {
          cp = {
            ...params.existingCheckpoint,
            confirmCount: params.existingCheckpoint.confirmCount,
            updatedAt: Date.now(),
          };
          // Reset only the legs we're about to attempt; keep confirmed.
          for (const leg of quoteJson.legs) {
            const prev = cp.legs.find((l) => l.key === leg.key);
            if (prev?.status === "confirmed") continue;
            const next: CheckpointLeg = {
              key: leg.key,
              mint: leg.mint,
              amountIn: leg.amountIn,
              status: "pending",
              baselineAmount:
                prev?.baselineAmount ?? baselineByKey[leg.key] ?? "0",
            };
            const idx = cp.legs.findIndex((l) => l.key === leg.key);
            if (idx >= 0) cp.legs[idx] = next;
            else cp.legs.push(next);
          }
        } else {
          cp = {
            intentId: `${params.side}-${Date.now()}`,
            side: params.side,
            wallet: pubkey,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            confirmCount,
            solLamports: params.solLamports,
            weightsPct: params.weightsPct,
            slippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
            intendedKeys: fullIntended as DegenSolanaMintKey[],
            legs: quoteJson.legs.map(
              (l): CheckpointLeg => ({
                key: l.key,
                mint: l.mint,
                amountIn: l.amountIn,
                status: "pending",
                baselineAmount: baselineByKey[l.key] ?? "0",
              }),
            ),
          };
        }
        saveCheckpoint(cp);

        const legResults: ExecProgress["legs"] = quoteJson.legs.map((l) => ({
          key: l.key,
          ticker: l.ticker,
          status: "pending",
        }));

        setProgress({
          phase: "Preparing transaction…",
          confirmCount,
          confirmMax,
          heldCount: 0,
          basketSize:
            params.side === "buy" ? basketSize : intendedKeys.length,
          legs: [...legResults],
        });

        // One canonical Jupiter /swap per asset (no hand-composed multi-leg packs).
        const swapRes = await fetch("/api/degen-solana/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userPublicKey: pubkey,
            side: params.side,
            legs: quoteJson.legs.map((l) => ({
              key: l.key,
              ticker: l.ticker,
              mint: l.mint,
              quoteResponse: l.quote,
              feeAccount: l.feeAccount,
            })),
          }),
        });
        const swapJson = (await swapRes.json()) as {
          legs?: BuiltSwapLeg[];
          error?: string;
        };
        if (!swapRes.ok || !swapJson.legs?.length) {
          throw new Error(swapJson.error ?? "Swap build failed");
        }

        const builtByKey = new Map(
          swapJson.legs.map((l) => [l.key, l] as const),
        );
        const orderedBuilt = quoteJson.legs
          .map((q) => builtByKey.get(q.key))
          .filter((x): x is BuiltSwapLeg => Boolean(x));

        const batches = splitLegsIntoSignBatches(orderedBuilt, SIGN_BATCH_MAX);

        for (const batch of batches) {
          if (confirmCount >= confirmMax) {
            for (const b of batch) {
              const idx = legResults.findIndex((x) => x.key === b.key);
              if (idx >= 0 && legResults[idx]!.status === "pending") {
                legResults[idx] = {
                  ...legResults[idx]!,
                  error: "Deferred — confirm budget. Use Finish remaining.",
                };
              }
            }
            break;
          }

          setProgress({
            phase: "Preparing transaction…",
            confirmCount,
            confirmMax,
            heldCount: legResults.filter((l) => l.status === "confirmed")
              .length,
            basketSize:
              params.side === "buy" ? basketSize : intendedKeys.length,
            legs: [...legResults],
          });

          // Fresh blockhash immediately before this sign batch — never reuse
          // a server/Jupiter stamp across human-latency prompts.
          const latest = await wallet.connection.getLatestBlockhash(
            "confirmed",
          );
          const txs = batch.map((b) => {
            const tx = decodeSwapTxBase64(b.swapTransaction);
            return restampVersionedTx(tx, latest.blockhash);
          });

          setProgress({
            phase: "Confirm in wallet…",
            confirmCount,
            confirmMax,
            heldCount: legResults.filter((l) => l.status === "confirmed")
              .length,
            basketSize:
              params.side === "buy" ? basketSize : intendedKeys.length,
            legs: [...legResults],
          });

          let signed: VersionedTransaction[];
          try {
            if (txs.length === 1) {
              signed = [await wallet.signTransaction(txs[0]!)];
              confirmCount += 1;
              cp.confirmCount = confirmCount;
            } else {
              try {
                signed = await wallet.signAllTransactions(txs);
                confirmCount += 1;
                cp.confirmCount = confirmCount;
              } catch (allErr) {
                // Cap fallback: never open more than remaining prompt budget.
                const remainingPrompts = confirmMax - confirmCount;
                if (remainingPrompts < 1) {
                  throw allErr instanceof Error
                    ? allErr
                    : new Error(String(allErr));
                }
                signed = [];
                const maxOneByOne = Math.min(txs.length, remainingPrompts);
                for (let i = 0; i < maxOneByOne; i += 1) {
                  const fresh = await wallet.connection.getLatestBlockhash(
                    "confirmed",
                  );
                  const restamped = restampVersionedTx(
                    VersionedTransaction.deserialize(txs[i]!.serialize()),
                    fresh.blockhash,
                  );
                  signed.push(await wallet.signTransaction(restamped));
                  confirmCount += 1;
                  cp.confirmCount = confirmCount;
                }
                if (signed.length < txs.length) {
                  for (let i = signed.length; i < batch.length; i += 1) {
                    const key = batch[i]!.key;
                    const idx = legResults.findIndex((x) => x.key === key);
                    if (idx >= 0) {
                      legResults[idx] = {
                        ...legResults[idx]!,
                        status: "pending",
                        error: "Deferred — confirm budget",
                      };
                    }
                  }
                }
              }
            }
          } catch (signErr) {
            const msg =
              signErr instanceof Error ? signErr.message : String(signErr);
            for (const b of batch) {
              const idx = legResults.findIndex((x) => x.key === b.key);
              if (idx >= 0) {
                legResults[idx] = {
                  key: b.key,
                  ticker: tickerForKey(b.key),
                  status: "failed",
                  error: msg,
                };
              }
              const cpLeg = cp.legs.find((l) => l.key === b.key);
              if (cpLeg && cpLeg.status !== "confirmed") {
                cpLeg.status = "failed";
                cpLeg.error = msg;
              }
            }
            saveCheckpoint(cp);
            break;
          }

          const pairs = signed.map((stx, i) => ({
            key: batch[i]!.key,
            signature: signatureFromSignedTx(stx),
            raw: stx.serialize(),
          }));

          for (const p of pairs) {
            const idx = legResults.findIndex((x) => x.key === p.key);
            if (idx >= 0) {
              legResults[idx] = {
                key: p.key,
                ticker: tickerForKey(p.key),
                status: "submitted",
                signature: p.signature,
              };
            }
            const cpLeg = cp.legs.find((l) => l.key === p.key);
            if (cpLeg) {
              cpLeg.status = "submitted";
              cpLeg.signature = p.signature;
            }
          }
          saveCheckpoint(cp);

          setProgress({
            phase: "Sending transaction…",
            confirmCount,
            confirmMax,
            heldCount: legResults.filter((l) => l.status === "confirmed")
              .length,
            basketSize:
              params.side === "buy" ? basketSize : intendedKeys.length,
            legs: [...legResults],
          });

          // Send the whole batch back-to-back before confirming (keep blockhash alive).
          await Promise.all(
            pairs.map(async (p) => {
              try {
                await wallet.connection.sendRawTransaction(p.raw, {
                  skipPreflight: false,
                  maxRetries: 3,
                });
              } catch (sendErr) {
                const msg =
                  sendErr instanceof Error
                    ? sendErr.message
                    : String(sendErr);
                if (!/already.*(process|been)|duplicate/i.test(msg)) {
                  const cpLeg = cp.legs.find((l) => l.key === p.key);
                  if (cpLeg && cpLeg.status === "submitted") {
                    cpLeg.error = msg;
                  }
                }
              }
            }),
          );
          saveCheckpoint(cp);

          setProgress({
            phase: "Confirming on-chain…",
            confirmCount,
            confirmMax,
            heldCount: legResults.filter((l) => l.status === "confirmed")
              .length,
            basketSize:
              params.side === "buy" ? basketSize : intendedKeys.length,
            legs: [...legResults],
          });

          await Promise.all(
            pairs.map(async (p) => {
              const outcome = await confirmSignatureHttp(
                wallet.connection,
                p.signature,
                {
                  blockhash: latest.blockhash,
                  lastValidBlockHeight: latest.lastValidBlockHeight,
                },
              );
              const nextStatus =
                outcome.status === "confirmed"
                  ? "confirmed"
                  : outcome.status === "failed"
                    ? "failed"
                    : "expired";
              const errMsg =
                outcome.status === "failed"
                  ? outcome.err
                  : outcome.status === "expired"
                    ? "Blockhash expired before confirmation"
                    : undefined;
              const idx = legResults.findIndex((x) => x.key === p.key);
              if (idx >= 0) {
                legResults[idx] = {
                  key: p.key,
                  ticker: tickerForKey(p.key),
                  status: nextStatus,
                  signature: p.signature,
                  error: errMsg,
                };
              }
              const cpLeg = cp.legs.find((l) => l.key === p.key);
              if (cpLeg) {
                cpLeg.status = nextStatus;
                cpLeg.signature = p.signature;
                cpLeg.error = errMsg;
              }
            }),
          );
          saveCheckpoint(cp);
        }

        await refreshBalances().catch(() => undefined);
        const balAfter = (await fetch(
          `/api/degen-solana/balances?owner=${encodeURIComponent(pubkey)}`,
        ).then((r) => r.json())) as {
          tokens?: Array<{ key: string; mint: string; amount: string }>;
        };

        // Attributable confirm: buy needs delta ≥ minOut; sell needs dust.
        for (const qleg of quoteJson.legs) {
          const leg = cp.legs.find((l) => l.key === qleg.key);
          if (!leg || leg.status !== "confirmed") continue;
          const tok = (balAfter.tokens ?? []).find((t) => t.key === leg.key);
          const now = BigInt(tok?.amount ?? "0");
          const base = BigInt(leg.baselineAmount ?? "0");
          if (params.side === "buy") {
            const minOut = minOutForLeg(qleg);
            const delta = now > base ? now - base : BigInt(0);
            // Accept if ≥ minOut, or any increase when minOut unknown/zero.
            const ok =
              minOut > BigInt(0) ? delta >= minOut : now > base;
            if (!ok) {
              leg.status = "failed";
              leg.error =
                delta > BigInt(0)
                  ? "Confirmed tx but fill below minOut"
                  : "Confirmed tx but no attributable token increase";
              const idx = legResults.findIndex((x) => x.key === leg.key);
              if (idx >= 0) {
                legResults[idx] = {
                  ...legResults[idx]!,
                  status: "failed",
                  error: leg.error,
                };
              }
            }
          } else {
            const dust = dustThresholdRaw(
              DEGEN_SOLANA_BASKET.find((m) => m.key === leg.key)?.decimals ??
                6,
            );
            if (now > dust) {
              leg.status = "failed";
              leg.error = "Confirmed tx but token balance not reduced to dust";
              const idx = legResults.findIndex((x) => x.key === leg.key);
              if (idx >= 0) {
                legResults[idx] = {
                  ...legResults[idx]!,
                  status: "failed",
                  error: leg.error,
                };
              }
            }
          }
        }

        // Merge into full-intent checkpoint when finishing a subset.
        if (params.existingCheckpoint) {
          cp = mergeCheckpointLegs(params.existingCheckpoint, cp.legs);
        }
        saveCheckpoint(cp);

        const confirmed = legResults.filter((l) => l.status === "confirmed");
        const confirmedCount = confirmed.length;

        // Complete = every intended mint confirmed (full basket on buy).
        const allCpConfirmed =
          params.side === "buy"
            ? (cp.intendedKeys ?? DEGEN_SOLANA_BASKET.map((m) => m.key)).every(
                (k) => cp.legs.find((l) => l.key === k)?.status === "confirmed",
              ) &&
              (cp.intendedKeys?.length ?? 0) === basketSize
            : intendedKeys.every(
                (k) =>
                  cp.legs.find((l) => l.key === k)?.status === "confirmed",
              ) && confirmedCount === intendedKeys.length;

        if (allCpConfirmed) {
          clearCheckpoint(pubkey, params.side);
        }

        const displayDenom =
          params.side === "buy" ? basketSize : intendedKeys.length;
        const displayNum =
          params.side === "buy"
            ? (cp.legs.filter((l) => l.status === "confirmed").length ||
                confirmedCount)
            : confirmedCount;

        const phase = allCpConfirmed
          ? params.side === "buy"
            ? "Buy complete"
            : "Sell All complete"
          : params.side === "buy"
            ? `Partial buy — ${displayNum} of ${displayDenom} confirmed`
            : `Partial sell — ${displayNum} of ${displayDenom} confirmed`;

        setProgress({
          phase,
          confirmCount,
          confirmMax,
          heldCount: displayNum,
          basketSize: displayDenom,
          legs: legResults,
        });

        return {
          confirmCount,
          legs: legResults,
          heldCount: displayNum,
          basketSize: displayDenom,
          complete: allCpConfirmed,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        await refreshBalances().catch(() => undefined);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [heldNonDustCount, refreshBalances, wallet],
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

      if (side === "buy") {
        if (!cp?.solLamports) {
          throw new Error(
            "No saved buy intent — enter SOL amount and use Buy for remaining sleeves, or Sell All to unwind.",
          );
        }

        // Reconcile submitted signatures before re-quoting.
        for (const leg of submittedLegs(cp)) {
          if (!leg.signature) {
            leg.status = "failed";
            leg.error = "Submitted without signature";
            continue;
          }
          try {
            const st = await wallet.connection.getSignatureStatuses(
              [leg.signature],
              { searchTransactionHistory: true },
            );
            const s = st.value[0];
            if (s?.err) {
              leg.status = "failed";
              leg.error =
                typeof s.err === "string" ? s.err : JSON.stringify(s.err);
            } else if (
              s?.confirmationStatus === "confirmed" ||
              s?.confirmationStatus === "finalized"
            ) {
              leg.status = "confirmed";
            } else {
              leg.status = "expired";
              leg.error = "Submitted tx not confirmed — will retry";
            }
          } catch {
            leg.status = "expired";
            leg.error = "Could not reconcile submitted tx — will retry";
          }
        }
        saveCheckpoint(cp);

        const balRes = await fetch(
          `/api/degen-solana/balances?owner=${encodeURIComponent(pk)}`,
        );
        const balJson = (await balRes.json()) as {
          tokens?: Array<{ key: string; amount: string }>;
        };

        // Promote confirmed+attributable; demote fake confirms.
        for (const leg of cp.legs) {
          const tok = (balJson.tokens ?? []).find((t) => t.key === leg.key);
          const now = BigInt(tok?.amount ?? "0");
          const base = BigInt(leg.baselineAmount ?? "0");
          if (leg.status === "confirmed" && now <= base) {
            leg.status = "failed";
            leg.error = "No attributable balance — will retry";
          } else if (
            (leg.status === "failed" ||
              leg.status === "expired" ||
              leg.status === "pending") &&
            now > base
          ) {
            // On-chain already filled (e.g. prior land after UI lost status).
            leg.status = "confirmed";
            leg.error = undefined;
          }
        }
        saveCheckpoint(cp);

        const missing = unfinishedLegs(cp)
          .map((l) => l.key)
          .filter((key) => {
            const leg = cp.legs.find((l) => l.key === key);
            const tok = (balJson.tokens ?? []).find((t) => t.key === key);
            const now = BigInt(tok?.amount ?? "0");
            const base = BigInt(leg?.baselineAmount ?? "0");
            return now <= base;
          });

        if (missing.length === 0) {
          const allOk =
            (cp.intendedKeys?.length ?? DEGEN_SOLANA_BASKET.length) ===
              DEGEN_SOLANA_BASKET.length &&
            cp.legs.every((l) => l.status === "confirmed");
          if (allOk) {
            clearCheckpoint(pk, "buy");
            await refreshBalances();
            return {
              confirmCount: cp.confirmCount,
              legs: cp.legs.map((l) => ({
                key: l.key,
                ticker: tickerForKey(l.key),
                status: l.status,
                signature: l.signature,
              })),
              heldCount: cp.legs.filter((l) => l.status === "confirmed")
                .length,
              basketSize: DEGEN_SOLANA_BASKET.length,
              complete: true,
            };
          }
          // Not all confirmed — do not fabricate 10/10.
          await refreshBalances();
          return {
            confirmCount: cp.confirmCount,
            legs: cp.legs.map((l) => ({
              key: l.key,
              ticker: tickerForKey(l.key),
              status: l.status,
              signature: l.signature,
              error: l.error,
            })),
            heldCount: cp.legs.filter((l) => l.status === "confirmed").length,
            basketSize: DEGEN_SOLANA_BASKET.length,
            complete: false,
          };
        }

        let weightsPct: number[] | undefined;
        if (cp.weightsPct && cp.intendedKeys) {
          const intended = cp.intendedKeys;
          const raw = missing.map((k) => {
            const i = intended.indexOf(k);
            return i >= 0 ? cp.weightsPct![i]! : 0;
          });
          const sum = raw.reduce((a, b) => a + b, 0);
          if (sum > 0) {
            weightsPct = raw.map((w) => Math.round((w / sum) * 100));
            const drift = 100 - weightsPct.reduce((a, b) => a + b, 0);
            if (drift !== 0 && weightsPct.length > 0) {
              weightsPct[0] = weightsPct[0]! + drift;
            }
          }
        }

        const balSol = (await fetch(
          `/api/degen-solana/balances?owner=${encodeURIComponent(pk)}`,
        ).then((r) => r.json())) as { solLamports?: string };
        const walletLamports = BigInt(balSol.solLamports ?? "0");
        const original = BigInt(cp.solLamports);
        const spend =
          walletLamports < original
            ? walletLamports.toString()
            : cp.solLamports;
        return runSide({
          side: "buy",
          solLamports: spend,
          slippageBps: cp.slippageBps,
          onlyKeys: missing,
          weightsPct,
          resume: true,
          existingCheckpoint: cp,
        });
      }

      // Sell finish
      if (cp) {
        for (const leg of submittedLegs(cp)) {
          if (!leg.signature) {
            leg.status = "failed";
            continue;
          }
          try {
            const st = await wallet.connection.getSignatureStatuses(
              [leg.signature],
              { searchTransactionHistory: true },
            );
            const s = st.value[0];
            if (s?.err) leg.status = "failed";
            else if (
              s?.confirmationStatus === "confirmed" ||
              s?.confirmationStatus === "finalized"
            ) {
              leg.status = "confirmed";
            } else {
              leg.status = "expired";
            }
          } catch {
            leg.status = "expired";
          }
        }
        saveCheckpoint(cp);
      }

      const onlyKeys = cp
        ? unfinishedLegs(cp).map((l) => l.key)
        : undefined;
      return runSide({
        side: "sell",
        onlyKeys: onlyKeys?.length ? onlyKeys : undefined,
        resume: true,
        existingCheckpoint: cp ?? undefined,
      });
    },
    [refreshBalances, runSide, wallet],
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
