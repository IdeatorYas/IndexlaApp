"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ATA_RENT_LAMPORTS,
  BUY_CONFIRM_MAX,
  DEFAULT_SLIPPAGE_BPS,
  DEGEN_SOLANA_BASKET,
  MIN_LEG_LAMPORTS,
  PRIORITY_FEE_RESERVE_LAMPORTS,
  SELL_CONFIRM_MAX,
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
import {
  confirmSignatureHttp,
  waitSignatureProcessed,
} from "@/lib/degen-solana/confirm";
import {
  decodeSwapTxBase64,
  restampVersionedTx,
  simulateVersionedTx,
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

type PackedSwapTx = {
  keys: string[];
  tickers: string[];
  mints?: string[];
  swapTransaction: string;
  blockhash?: string;
  lastValidBlockHeight?: number;
  sizeBytes?: number;
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
      /** Sell fraction 1–100 (default 100 = Sell All). */
      sellPct?: number;
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
          solLamports?: string;
          error?: string;
        };
        if (!balRes.ok) throw new Error(balJson.error ?? "balances failed");
        for (const t of balJson.tokens ?? []) {
          baselineByKey[t.key] = t.amount;
        }

        // Sells need gas SOL — fail early instead of mid-batch.
        if (params.side === "sell") {
          const solAvail = BigInt(balJson.solLamports ?? "0");
          const minFee = PRIORITY_FEE_RESERVE_LAMPORTS / BigInt(2);
          if (solAvail < minFee) {
            throw new Error(
              `Need ~${Number(minFee) / 1e9} SOL in wallet for network fees before selling.`,
            );
          }
        }

        // Skip sleeves already filled above dust on a fresh buy (don't rebuy).
        // Always keep full-basket intendedKeys so we never claim 10/10 from a subset.
        let onlyKeys = params.onlyKeys;
        let weightsPct = params.weightsPct;
        const alreadyHeldKeys: string[] = [];
        if (params.side === "buy") {
          const already = (balJson.tokens ?? []).filter((t) => {
            const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === t.key);
            return BigInt(t.amount) > dustThresholdRaw(meta?.decimals ?? 6);
          });
          alreadyHeldKeys.push(...already.map((t) => t.key));
          if (!onlyKeys) {
            if (already.length > 0 && already.length < basketSize) {
              const held = new Set(alreadyHeldKeys);
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
        }

        if (params.side === "sell") {
          sellAmounts = {};
          const sellPct = Math.min(
            100,
            Math.max(1, Math.round(params.sellPct ?? 100)),
          );
          for (const t of balJson.tokens ?? []) {
            const mintMeta = DEGEN_SOLANA_BASKET.find((m) => m.mint === t.mint);
            const dust = dustThresholdRaw(mintMeta?.decimals ?? 6);
            if (BigInt(t.amount) <= dust) continue;
            if (onlyKeys && !onlyKeys.includes(t.key)) continue;
            let amt = BigInt(t.amount);
            if (sellPct < 100) {
              amt = (amt * BigInt(sellPct)) / BigInt(100);
              const rem = BigInt(t.amount) - amt;
              // Remainder that is only dust → sell all to avoid stranded dust.
              if (rem > BigInt(0) && rem <= dust) {
                amt = BigInt(t.amount);
              }
              if (amt <= dust) continue;
            }
            sellAmounts[t.mint] = amt.toString();
          }
          if (Object.keys(sellAmounts).length === 0) {
            throw new Error(
              sellPct < 100
                ? "No basket balances large enough to sell at that %"
                : "No basket token balances to sell",
            );
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
        const fullIntended: DegenSolanaMintKey[] =
          (params.existingCheckpoint?.intendedKeys as
            | DegenSolanaMintKey[]
            | undefined) ??
          (params.side === "buy"
            ? DEGEN_SOLANA_BASKET.map((m) => m.key)
            : (intendedKeys as DegenSolanaMintKey[]));

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
        } else if (params.side === "buy") {
          // Full-basket checkpoint: already-held sleeves are confirmed; rest pending.
          const heldSet = new Set(alreadyHeldKeys);
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
            intendedKeys: fullIntended,
            legs: DEGEN_SOLANA_BASKET.map((m): CheckpointLeg => {
              const q = quoteJson.legs.find((l) => l.key === m.key);
              if (heldSet.has(m.key) && !q) {
                return {
                  key: m.key,
                  mint: m.mint,
                  amountIn: "0",
                  status: "confirmed",
                  baselineAmount: baselineByKey[m.key] ?? "0",
                  error: "Already held on-chain",
                };
              }
              return {
                key: m.key,
                mint: m.mint,
                amountIn: q?.amountIn ?? "0",
                status: "pending",
                baselineAmount: baselineByKey[m.key] ?? "0",
              };
            }),
          };
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
            sellPct: Math.min(
              100,
              Math.max(1, Math.round(params.sellPct ?? 100)),
            ),
            intendedKeys: fullIntended,
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
          phase: "Building packs…",
          confirmCount,
          confirmMax,
          heldCount: 0,
          basketSize:
            params.side === "buy" ? basketSize : intendedKeys.length,
          legs: [...legResults],
        });

        const sellPctNow = Math.min(
          100,
          Math.max(1, Math.round(params.sellPct ?? 100)),
        );
        const closeEmptiedAtas =
          params.side === "sell" && sellPctNow >= 100;

        // Multi-leg packs (≤4 prompts). Never start a partial basket.
        const packRes = await fetch("/api/degen-solana/pack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userPublicKey: pubkey,
            side: params.side,
            closeEmptiedAtas,
            legs: quoteJson.legs.map((l) => ({
              key: l.key,
              ticker: l.ticker,
              mint: l.mint,
              quote: l.quote,
              feeAccount: l.feeAccount,
            })),
          }),
        });
        const packJson = (await packRes.json()) as {
          packs?: PackedSwapTx[];
          error?: string;
        };
        if (!packRes.ok || !packJson.packs?.length) {
          throw new Error(
            packJson.error ??
              "Could not pack all assets into ≤4 wallet confirms",
          );
        }

        const packs = packJson.packs;
        if (packs.length > confirmMax) {
          throw new Error(
            `Packer returned ${packs.length} packs (max ${confirmMax})`,
          );
        }

        // Every intended ticker must appear in a pack — no silent drops.
        const packedKeys = new Set(packs.flatMap((p) => p.keys));
        const missingFromPacks = quoteJson.legs.filter(
          (l) => !packedKeys.has(l.key),
        );
        if (missingFromPacks.length > 0) {
          throw new Error(
            `Cannot include ${missingFromPacks.map((m) => m.ticker).join(", ")} — packing refused before any wallet prompt`,
          );
        }

        setProgress({
          phase: "Simulating packs…",
          confirmCount,
          confirmMax,
          heldCount: 0,
          basketSize:
            params.side === "buy" ? basketSize : intendedKeys.length,
          legs: [...legResults],
        });

        // Pre-sign gate: simulate EVERY pack before the first wallet prompt.
        for (const pack of packs) {
          const latest = await wallet.connection.getLatestBlockhash(
            "confirmed",
          );
          const tx = restampVersionedTx(
            decodeSwapTxBase64(pack.swapTransaction),
            latest.blockhash,
          );
          const sim = await simulateVersionedTx(wallet.connection, tx);
          if (!sim.ok) {
            throw new Error(
              `${pack.tickers.join(", ")} failed simulation before signing: ${sim.error.slice(0, 160)}`,
            );
          }
        }

        // Phantom Blowfish: one signAndSendTransaction per pack (not signAll).
        for (const pack of packs) {
          if (confirmCount >= confirmMax) {
            for (const key of pack.keys) {
              const idx = legResults.findIndex((x) => x.key === key);
              if (idx >= 0 && legResults[idx]!.status === "pending") {
                legResults[idx] = {
                  ...legResults[idx]!,
                  error:
                    "Deferred — confirm budget. Resume Remaining to continue.",
                };
              }
            }
            break;
          }

          const packLabel = pack.tickers.join("+");
          setProgress({
            phase: `Preparing ${packLabel}…`,
            confirmCount,
            confirmMax,
            heldCount: legResults.filter((l) => l.status === "confirmed")
              .length,
            basketSize:
              params.side === "buy" ? basketSize : intendedKeys.length,
            legs: [...legResults],
          });

          let latest = await wallet.connection.getLatestBlockhash(
            "confirmed",
          );
          const tx = restampVersionedTx(
            decodeSwapTxBase64(pack.swapTransaction),
            latest.blockhash,
          );

          const sim = await simulateVersionedTx(wallet.connection, tx);
          if (!sim.ok) {
            const errStr = `Simulation failed: ${sim.error.slice(0, 160)}`;
            for (const key of pack.keys) {
              const idx = legResults.findIndex((x) => x.key === key);
              if (idx >= 0) {
                legResults[idx] = {
                  key,
                  ticker: tickerForKey(key),
                  status: "failed",
                  error: errStr,
                };
              }
              const cpLeg = cp.legs.find((l) => l.key === key);
              if (cpLeg && cpLeg.status !== "confirmed") {
                cpLeg.status = "failed";
                cpLeg.error = errStr;
              }
            }
            saveCheckpoint(cp);
            // Pack is atomic — stop so Resume Remaining can retry leftovers.
            break;
          }

          setProgress({
            phase: `Confirm ${packLabel} in wallet…`,
            confirmCount,
            confirmMax,
            heldCount: legResults.filter((l) => l.status === "confirmed")
              .length,
            basketSize:
              params.side === "buy" ? basketSize : intendedKeys.length,
            legs: [...legResults],
          });

          let signature: string;
          try {
            signature = await wallet.signAndSendTransaction(tx);
            confirmCount += 1;
            cp.confirmCount = confirmCount;
          } catch (signErr) {
            const msg =
              signErr instanceof Error ? signErr.message : String(signErr);
            for (const key of pack.keys) {
              const idx = legResults.findIndex((x) => x.key === key);
              if (idx >= 0) {
                legResults[idx] = {
                  key,
                  ticker: tickerForKey(key),
                  status: "failed",
                  error: msg,
                };
              }
              const cpLeg = cp.legs.find((l) => l.key === key);
              if (cpLeg && cpLeg.status !== "confirmed") {
                cpLeg.status = "failed";
                cpLeg.error = msg;
              }
            }
            saveCheckpoint(cp);
            // Preserve progress; do not continue past a failed pack.
            break;
          }

          for (const key of pack.keys) {
            const idx = legResults.findIndex((x) => x.key === key);
            if (idx >= 0) {
              legResults[idx] = {
                key,
                ticker: tickerForKey(key),
                status: "submitted",
                signature,
              };
            }
            const cpLeg = cp.legs.find((l) => l.key === key);
            if (cpLeg) {
              cpLeg.status = "submitted";
              cpLeg.signature = signature;
            }
          }
          saveCheckpoint(cp);

          setProgress({
            phase: `Confirming ${packLabel}…`,
            confirmCount,
            confirmMax,
            heldCount: legResults.filter((l) => l.status === "confirmed")
              .length,
            basketSize:
              params.side === "buy" ? basketSize : intendedKeys.length,
            legs: [...legResults],
          });

          await waitSignatureProcessed(wallet.connection, signature, {
            timeoutMs: 12_000,
            pollMs: 350,
          });

          const outcome = await confirmSignatureHttp(
            wallet.connection,
            signature,
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
          for (const key of pack.keys) {
            const idx = legResults.findIndex((x) => x.key === key);
            if (idx >= 0) {
              legResults[idx] = {
                key,
                ticker: tickerForKey(key),
                status: nextStatus,
                signature,
                error: errMsg,
              };
            }
            const cpLeg = cp.legs.find((l) => l.key === key);
            if (cpLeg) {
              cpLeg.status = nextStatus;
              cpLeg.signature = signature;
              cpLeg.error = errMsg;
            }
          }
          saveCheckpoint(cp);

          if (nextStatus !== "confirmed") {
            // Stop — remaining packs stay pending for Resume Remaining.
            break;
          }
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
            const sold = now < base ? base - now : BigInt(0);
            const target = BigInt(leg.amountIn || "0");
            const fullExit = target === BigInt(0) || target + dust >= base;
            const ok = fullExit
              ? now <= dust
              : sold + BigInt(1) >= target; // 1 raw unit rounding tolerance
            if (!ok) {
              leg.status = "failed";
              leg.error = fullExit
                ? "Confirmed tx but token balance not reduced to dust"
                : "Confirmed tx but sell amount not attributable";
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

        // Inventory gate: never claim complete while any intended sleeve is wrong.
        const inventoryHeld = heldNonDustCount(balAfter.tokens ?? []);
        const cpKeysOk =
          params.side === "buy"
            ? (cp.intendedKeys ?? DEGEN_SOLANA_BASKET.map((m) => m.key)).every(
                (k) => cp.legs.find((l) => l.key === k)?.status === "confirmed",
              ) &&
              (cp.intendedKeys?.length ?? 0) === basketSize
            : intendedKeys.every(
                (k) =>
                  cp.legs.find((l) => l.key === k)?.status === "confirmed",
              ) && confirmedCount === intendedKeys.length;

        const sellPctFinal = Math.min(
          100,
          Math.max(1, Math.round(params.sellPct ?? 100)),
        );
        const inventoryOk =
          params.side === "buy"
            ? inventoryHeld === basketSize
            : sellPctFinal >= 100
              ? inventoryHeld === 0
              : cpKeysOk;

        const allCpConfirmed = cpKeysOk && inventoryOk;

        if (allCpConfirmed) {
          clearCheckpoint(pubkey, params.side);
        }

        const displayDenom =
          params.side === "buy" ? basketSize : intendedKeys.length;
        const displayNum =
          params.side === "buy"
            ? inventoryHeld ||
              cp.legs.filter((l) => l.status === "confirmed").length ||
              confirmedCount
            : confirmedCount;

        const failedTickers = legResults
          .filter((l) => l.status === "failed" || l.status === "pending")
          .map((l) => l.ticker);
        const leftoverNote =
          !allCpConfirmed && failedTickers.length > 0
            ? ` · remaining: ${[...new Set(failedTickers)].join(", ")}`
            : !allCpConfirmed &&
                params.side === "sell" &&
                sellPctFinal >= 100 &&
                inventoryHeld > 0
              ? ` · ${inventoryHeld} asset(s) still held (incl. check WIF)`
              : "";

        const phase = allCpConfirmed
          ? params.side === "buy"
            ? "Buy complete"
            : sellPctFinal >= 100
              ? "Sell All complete"
              : `Sold ${sellPctFinal}%`
          : params.side === "buy"
            ? `Partial buy — ${displayNum} of ${displayDenom} confirmed${leftoverNote}`
            : `Partial sell — ${displayNum} of ${displayDenom} confirmed${leftoverNote}`;

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
    (slippageBps?: number) => runSide({ side: "sell", slippageBps, sellPct: 100 }),
    [runSide],
  );

  const sellPercent = useCallback(
    (pct: number, slippageBps?: number) => {
      const sellPct = Math.min(100, Math.max(1, Math.round(pct)));
      return runSide({ side: "sell", slippageBps, sellPct });
    },
    [runSide],
  );

  const hasIncomplete = useCallback((): { buy: boolean; sell: boolean } => {
    const pk = wallet.publicKey;
    if (!pk) return { buy: false, sell: false };
    const buyCp = loadCheckpoint(pk, "buy");
    const sellCp = loadCheckpoint(pk, "sell");
    const buyUnfinished = buyCp ? unfinishedLegs(buyCp).length > 0 : false;
    const sellUnfinished = sellCp
      ? unfinishedLegs(sellCp).length > 0
      : false;
    // Partial on-chain holdings with a saved buy intent → offer resume.
    const heldPartial =
      Boolean(buyCp) &&
      (balances?.tokens ?? []).filter((t) => {
        const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === t.key);
        return BigInt(t.amount) > dustThresholdRaw(meta?.decimals ?? 6);
      }).length;
    const buyPartial =
      buyUnfinished ||
      (heldPartial > 0 && heldPartial < DEGEN_SOLANA_BASKET.length && Boolean(buyCp));
    return { buy: buyPartial, sell: sellUnfinished };
  }, [wallet.publicKey, balances]);

  const finishIncomplete = useCallback(
    async (side: "buy" | "sell") => {
      if (!wallet.publicKey) await wallet.connect();
      const pk = wallet.publicKey;
      if (!pk) throw new Error("Connect Solana wallet first");
      const cp = loadCheckpoint(pk, side);

      if (side === "buy") {
        // No localStorage: derive missing sleeves from on-chain holdings alone.
        if (!cp) {
          const balRes = await fetch(
            `/api/degen-solana/balances?owner=${encodeURIComponent(pk)}`,
          );
          const balJson = (await balRes.json()) as {
            tokens?: Array<{ key: string; amount: string }>;
            solLamports?: string;
            error?: string;
          };
          if (!balRes.ok) throw new Error(balJson.error ?? "balances failed");
          const missing = DEGEN_SOLANA_BASKET.filter((m) => {
            const tok = (balJson.tokens ?? []).find((t) => t.key === m.key);
            return (
              BigInt(tok?.amount ?? "0") <= dustThresholdRaw(m.decimals)
            );
          }).map((m) => m.key);
          if (missing.length === 0) {
            await refreshBalances();
            throw new Error(
              "Wallet already holds all 10 basket assets. Use Sell All to unwind.",
            );
          }
          if (missing.length === DEGEN_SOLANA_BASKET.length) {
            throw new Error(
              "No saved buy intent and no partial holdings — enter SOL and use Buy.",
            );
          }
          // Spend only a proportional fraction of wallet SOL for remaining sleeves.
          const walletLamports = BigInt(balJson.solLamports ?? "0");
          const fraction =
            BigInt(missing.length) * BigInt(1_000_000_000) /
            BigInt(DEGEN_SOLANA_BASKET.length);
          const spend =
            (walletLamports * fraction) / BigInt(1_000_000_000);
          const minSpend =
            ATA_RENT_LAMPORTS * BigInt(missing.length) +
            PRIORITY_FEE_RESERVE_LAMPORTS +
            MIN_LEG_LAMPORTS * BigInt(missing.length);
          if (spend < minSpend) {
            throw new Error(
              `Need more SOL to finish ${missing.length} remaining sleeves (~${Number(minSpend) / 1e9} SOL).`,
            );
          }
          return runSide({
            side: "buy",
            solLamports: spend.toString(),
            onlyKeys: missing,
            resume: true,
          });
        }

        if (!cp.solLamports) {
          throw new Error(
            "Saved buy intent missing SOL amount — enter SOL and use Buy for remaining sleeves, or Sell All to unwind.",
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
        // Only spend the unspent share of the original intent (not full wallet).
        const alreadySpent = cp.legs
          .filter((l) => l.status === "confirmed")
          .reduce((a, l) => a + BigInt(l.amountIn || "0"), BigInt(0));
        let remaining = original > alreadySpent ? original - alreadySpent : BigInt(0);
        if (remaining <= BigInt(0)) {
          // Fallback: proportional to missing sleeve count.
          remaining =
            (original * BigInt(missing.length)) /
            BigInt(cp.intendedKeys?.length || DEGEN_SOLANA_BASKET.length);
        }
        const spend =
          walletLamports < remaining
            ? walletLamports.toString()
            : remaining.toString();
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
        sellPct: cp?.sellPct ?? 100,
        slippageBps: cp?.slippageBps,
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
    sellPercent,
    finishIncomplete,
    hasIncomplete,
    basket: DEGEN_SOLANA_BASKET,
  };
}
