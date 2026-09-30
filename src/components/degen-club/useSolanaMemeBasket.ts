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
  simulateVersionedTxWithRetry,
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
      let confirmCount = params.existingCheckpoint?.confirmCount ?? 0;
      const confirmMax =
        params.side === "buy" ? BUY_CONFIRM_MAX : SELL_CONFIRM_MAX;
      const isSell = params.side === "sell";
      // Sell: fresh per-click signature budget (do not inherit exhausted checkpoint count).
      let sessionConfirmCount = isSell ? 0 : confirmCount;
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
        void sellPctNow; // retained for sell-% pack policy decisions above
        // Sell: never close token ATAs inside swap packs (residuals revert whole pack).
        // WSOL unwrap/close still happens in composePack. Buy path unchanged.
        const closeEmptiedAtas = false;

        // Multi-leg packs. Sell forces ≤3 prompts; buy keeps default ≤4.
        const packRes = await fetch("/api/degen-solana/pack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userPublicKey: pubkey,
            side: params.side,
            closeEmptiedAtas: isSell ? false : closeEmptiedAtas,
            ...(isSell ? { promptMax: confirmMax } : {}),
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
              (isSell
                ? "Could not pack all assets into ≤3 wallet confirms"
                : "Could not pack all assets into ≤4 wallet confirms"),
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

        // Pre-sign gate: buy simulates EVERY pack before the first wallet prompt
        // and aborts on any failure. Sell does not throw here — packs are rebuilt
        // after each confirmation (WSOL state changes) and failed sims continue.
        if (!isSell) {
          const preLatest = await wallet.connection.getLatestBlockhash(
            "confirmed",
          );
          for (const pack of packs) {
            const tx = restampVersionedTx(
              decodeSwapTxBase64(pack.swapTransaction),
              preLatest.blockhash,
            );
            const sim = await simulateVersionedTxWithRetry(
              wallet.connection,
              tx,
            );
            if (!sim.ok) {
              throw new Error(
                `${pack.tickers.join(", ")} failed simulation before signing: ${sim.error.slice(0, 160)}`,
              );
            }
            await new Promise((r) => setTimeout(r, 120));
          }
        }

        const markPackStatus = (
          keys: string[],
          status: "failed" | "pending" | "submitted" | "confirmed" | "expired",
          error?: string,
          signature?: string,
        ) => {
          for (const key of keys) {
            const idx = legResults.findIndex((x) => x.key === key);
            if (idx >= 0) {
              legResults[idx] = {
                key,
                ticker: tickerForKey(key),
                status,
                signature: signature ?? legResults[idx]!.signature,
                error,
              };
            }
            const cpLeg = cp.legs.find((l) => l.key === key);
            if (cpLeg && cpLeg.status !== "confirmed") {
              cpLeg.status = status;
              if (signature) cpLeg.signature = signature;
              cpLeg.error = error;
            }
          }
          if (isSell) {
            cp.confirmCount = Math.max(cp.confirmCount ?? 0, confirmCount);
          }
          saveCheckpoint(cp);
        };

        // Phantom cancel only — do not treat generic "cancel"/RPC noise as reject.
        const isUserReject = (msg: string) =>
          /User rejected|rejected the request|4001/i.test(msg);

        let userRejected = false;
        let packsToRun = packs;

        const signingBudgetUsed = () =>
          isSell ? sessionConfirmCount : confirmCount;

        const bumpSigned = () => {
          confirmCount += 1;
          if (isSell) sessionConfirmCount += 1;
          cp.confirmCount = Math.max(cp.confirmCount ?? 0, confirmCount);
        };

        const amountAboveDust = (
          tokens: Array<{ key: string; amount: string }> | undefined,
          key: string,
        ) => {
          const tok = (tokens ?? []).find((t) => t.key === key);
          const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === key);
          const dust = dustThresholdRaw(meta?.decimals ?? 6);
          return BigInt(tok?.amount ?? "0") > dust;
        };

        const promoteDustLegs = (
          tokens: Array<{ key: string; amount: string }> | undefined,
        ) => {
          for (const k of intendedKeys) {
            if (!amountAboveDust(tokens, k)) {
              const st = cp.legs.find((l) => l.key === k)?.status;
              if (st !== "confirmed") markPackStatus([k], "confirmed");
            }
          }
        };

        const runPackSignLoop = async (wave: number) => {
          let signedThisRound = 0;
          for (let packIdx = 0; packIdx < packsToRun.length; packIdx += 1) {
            const pack = packsToRun[packIdx]!;
            if (signingBudgetUsed() >= confirmMax) {
              markPackStatus(
                pack.keys.filter(
                  (k) =>
                    cp.legs.find((l) => l.key === k)?.status !== "confirmed",
                ),
                "pending",
                "Deferred — confirm budget. Resume Remaining to continue.",
              );
              continue;
            }

            if (isSell) {
              // Sell only: skip when every leg is already ≤ dust on-chain.
              // Never apply this to buy — empty ATAs look like "dust" and would
              // fake-confirm packs → Partial buy 0/10 after attribution demote.
              const balSkip = (await fetch(
                `/api/degen-solana/balances?owner=${encodeURIComponent(pubkey)}`,
              ).then((r) => r.json())) as {
                tokens?: Array<{ key: string; amount: string }>;
              };
              if (
                pack.keys.every((k) => !amountAboveDust(balSkip.tokens, k))
              ) {
                markPackStatus(pack.keys, "confirmed");
                continue;
              }
              // Do not re-send a pack whose legs are still in-flight (submitted).
              const allSubmitted = pack.keys.every((k) => {
                const st = cp.legs.find((l) => l.key === k)?.status;
                return st === "submitted" || st === "confirmed";
              });
              if (
                allSubmitted &&
                pack.keys.some(
                  (k) =>
                    cp.legs.find((l) => l.key === k)?.status === "submitted",
                )
              ) {
                continue;
              }
            } else {
              // Buy: preserve prior skip — only skip packs already checkpoint-confirmed.
              const alreadyDone = pack.keys.every(
                (k) =>
                  cp.legs.find((l) => l.key === k)?.status === "confirmed",
              );
              if (alreadyDone) continue;
            }

            const packLabel = pack.tickers.join("+");
            setProgress({
              phase: `Preparing ${packLabel} (${signingBudgetUsed() + 1}/${confirmMax})…`,
              confirmCount: signingBudgetUsed(),
              confirmMax,
              heldCount: legResults.filter((l) => l.status === "confirmed")
                .length,
              basketSize:
                params.side === "buy" ? basketSize : intendedKeys.length,
              legs: [...legResults],
            });

            if (packIdx > 0 || wave > 0) {
              await new Promise((r) => setTimeout(r, 400));
            }

            let latest;
            try {
              latest = await wallet.connection.getLatestBlockhash("confirmed");
            } catch (bhErr) {
              const msg =
                bhErr instanceof Error ? bhErr.message : String(bhErr);
              markPackStatus(
                pack.keys,
                "failed",
                `Blockhash fetch failed: ${msg.slice(0, 120)}`,
              );
              continue;
            }

            const tx = restampVersionedTx(
              decodeSwapTxBase64(pack.swapTransaction),
              latest.blockhash,
            );

            const sim = await simulateVersionedTxWithRetry(
              wallet.connection,
              tx,
            );
            if (!sim.ok) {
              markPackStatus(
                pack.keys,
                "failed",
                `Simulation failed: ${sim.error.slice(0, 160)}`,
              );
              continue;
            }

            setProgress({
              phase: `Confirm ${packLabel} in wallet (${signingBudgetUsed() + 1}/${confirmMax})…`,
              confirmCount: signingBudgetUsed(),
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
              bumpSigned();
              signedThisRound += 1;
            } catch (signErr) {
              const msg =
                signErr instanceof Error ? signErr.message : String(signErr);
              markPackStatus(pack.keys, "failed", msg);
              if (isUserReject(msg)) {
                userRejected = true;
                break;
              }
              continue;
            }

            // Persist submitted+sig before waiting so resume can reconcile.
            markPackStatus(pack.keys, "submitted", undefined, signature);

            setProgress({
              phase: `Confirming ${packLabel}…`,
              confirmCount: signingBudgetUsed(),
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

            let outcome = await confirmSignatureHttp(
              wallet.connection,
              signature,
              {
                blockhash: latest.blockhash,
                lastValidBlockHeight: latest.lastValidBlockHeight,
              },
            );

            if (outcome.status === "expired") {
              try {
                const st = await wallet.connection.getSignatureStatuses(
                  [signature],
                  { searchTransactionHistory: true },
                );
                const s = st.value[0];
                if (
                  s &&
                  !s.err &&
                  (s.confirmationStatus === "confirmed" ||
                    s.confirmationStatus === "finalized")
                ) {
                  outcome = { status: "confirmed" };
                } else if (s?.err) {
                  outcome = {
                    status: "failed",
                    err:
                      typeof s.err === "string"
                        ? s.err
                        : JSON.stringify(s.err),
                  };
                }
              } catch {
                /* keep expired */
              }
            }

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
            markPackStatus(pack.keys, nextStatus, errMsg, signature);

            // After each confirmed sell pack, promote legs already at dust.
            if (isSell && nextStatus === "confirmed") {
              const balNow = (await fetch(
                `/api/degen-solana/balances?owner=${encodeURIComponent(pubkey)}`,
              ).then((r) => r.json())) as {
                tokens?: Array<{ key: string; amount: string }>;
              };
              promoteDustLegs(balNow.tokens);
            }
          }
          return signedThisRound;
        };

        const rebuildSellPacks = async (): Promise<boolean> => {
          const balMid = (await fetch(
            `/api/degen-solana/balances?owner=${encodeURIComponent(pubkey)}`,
          ).then((r) => r.json())) as {
            tokens?: Array<{ key: string; mint: string; amount: string }>;
          };
          promoteDustLegs(balMid.tokens);

          const unfinishedKeys = intendedKeys.filter((k) => {
            const st = cp.legs.find((l) => l.key === k)?.status;
            // In-flight submitted: wait for reconcile, do not re-quote yet.
            if (st === "submitted") return false;
            return amountAboveDust(balMid.tokens, k);
          });
          if (unfinishedKeys.length === 0) {
            packsToRun = [];
            return false;
          }
          if (sessionConfirmCount >= confirmMax) return false;

          setProgress({
            phase: `Continuing remaining ${unfinishedKeys.length} asset(s)…`,
            confirmCount: sessionConfirmCount,
            confirmMax,
            heldCount: legResults.filter((l) => l.status === "confirmed")
              .length,
            basketSize: intendedKeys.length,
            legs: [...legResults],
          });

          const contSellAmounts: Record<string, string> = {};
          const sellPct = Math.min(
            100,
            Math.max(1, Math.round(params.sellPct ?? 100)),
          );
          for (const t of balMid.tokens ?? []) {
            if (!unfinishedKeys.includes(t.key as DegenSolanaMintKey)) continue;
            const mintMeta = DEGEN_SOLANA_BASKET.find((m) => m.mint === t.mint);
            const dust = dustThresholdRaw(mintMeta?.decimals ?? 6);
            let amt = BigInt(t.amount);
            if (amt <= dust) continue;
            if (sellPct < 100) {
              // Partial % must use original baseline, not leftover×% again.
              const base = BigInt(
                cp.legs.find((l) => l.key === t.key)?.baselineAmount ??
                  t.amount,
              );
              const alreadySold = base > amt ? base - amt : BigInt(0);
              const target = (base * BigInt(sellPct)) / BigInt(100);
              if (alreadySold + dust >= target) {
                markPackStatus([t.key], "confirmed");
                continue;
              }
              amt = target > alreadySold ? target - alreadySold : BigInt(0);
              if (amt <= dust) continue;
            }
            contSellAmounts[t.key] = amt.toString();
          }
          if (Object.keys(contSellAmounts).length === 0) {
            packsToRun = [];
            return false;
          }

          const qRes = await fetch("/api/degen-solana/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              side: "sell",
              owner: pubkey,
              sellAmounts: contSellAmounts,
              slippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
            }),
          });
          const qJson = (await qRes.json()) as {
            legs?: Array<{
              key: string;
              ticker: string;
              mint: string;
              quote: unknown;
              feeAccount?: string;
            }>;
            error?: string;
          };
          if (!qRes.ok || !qJson.legs?.length) return false;

          const remainBudget = Math.max(1, confirmMax - sessionConfirmCount);
          const pRes = await fetch("/api/degen-solana/pack", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userPublicKey: pubkey,
              side: "sell",
              closeEmptiedAtas: false,
              promptMax: remainBudget,
              legs: qJson.legs.map((l) => ({
                key: l.key,
                ticker: l.ticker,
                mint: l.mint,
                quote: l.quote,
                feeAccount: l.feeAccount,
              })),
            }),
          });
          const pJson = (await pRes.json()) as {
            packs?: typeof packs;
            error?: string;
          };
          if (!pRes.ok || !pJson.packs?.length) return false;
          packsToRun = pJson.packs;
          return true;
        };

        if (isSell) {
          // One Sell All click: rebuild after each wave until dust / budget / reject.
          let wave = 0;
          while (!userRejected && sessionConfirmCount < confirmMax) {
            const signed = await runPackSignLoop(wave);
            if (userRejected) break;
            const balCheck = (await fetch(
              `/api/degen-solana/balances?owner=${encodeURIComponent(pubkey)}`,
            ).then((r) => r.json())) as {
              tokens?: Array<{ key: string; amount: string }>;
            };
            promoteDustLegs(balCheck.tokens);
            const stillSellable = intendedKeys.some((k) =>
              amountAboveDust(balCheck.tokens, k),
            );
            if (!stillSellable) break;
            if (sessionConfirmCount >= confirmMax) break;
            // Zero progress this round → stop (do not spin on perpetual sim fails).
            if (signed === 0 && wave > 0) break;
            const rebuilt = await rebuildSellPacks();
            if (!rebuilt) {
              if (signed === 0) break;
              // Had signatures but rebuild failed — stop rather than spin.
              break;
            }
            wave += 1;
            if (wave > 6) break;
          }
        } else {
          // Buy path: preserve prior two-wave auto-continue behavior.
          for (let wave = 0; wave < 2 && !userRejected; wave += 1) {
            if (wave > 0) {
              const balMid = (await fetch(
                `/api/degen-solana/balances?owner=${encodeURIComponent(pubkey)}`,
              ).then((r) => r.json())) as {
                tokens?: Array<{ key: string; mint: string; amount: string }>;
              };
              const unfinishedKeys = intendedKeys.filter((k) => {
                const st = cp.legs.find((l) => l.key === k)?.status;
                if (st === "confirmed") return false;
                const tok = (balMid.tokens ?? []).find((t) => t.key === k);
                const base = BigInt(
                  cp.legs.find((l) => l.key === k)?.baselineAmount ?? "0",
                );
                return BigInt(tok?.amount ?? "0") <= base;
              });
              if (unfinishedKeys.length === 0) break;
              if (confirmCount >= confirmMax) break;

              setProgress({
                phase: `Continuing remaining ${unfinishedKeys.length} asset(s)…`,
                confirmCount,
                confirmMax,
                heldCount: legResults.filter((l) => l.status === "confirmed")
                  .length,
                basketSize: basketSize,
                legs: [...legResults],
              });

              const quoteBody = {
                side: "buy" as const,
                owner: pubkey,
                solLamports: params.solLamports,
                slippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
                onlyKeys: unfinishedKeys,
                weightsPct,
              };
              const qRes = await fetch("/api/degen-solana/quote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(quoteBody),
              });
              const qJson = (await qRes.json()) as {
                legs?: Array<{
                  key: string;
                  ticker: string;
                  mint: string;
                  quote: unknown;
                  feeAccount?: string;
                }>;
                error?: string;
              };
              if (!qRes.ok || !qJson.legs?.length) break;
              const pRes = await fetch("/api/degen-solana/pack", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userPublicKey: pubkey,
                  side: "buy",
                  closeEmptiedAtas: false,
                  legs: qJson.legs.map((l) => ({
                    key: l.key,
                    ticker: l.ticker,
                    mint: l.mint,
                    quote: l.quote,
                    feeAccount: l.feeAccount,
                  })),
                }),
              });
              const pJson = (await pRes.json()) as {
                packs?: typeof packs;
                error?: string;
              };
              if (!pRes.ok || !pJson.packs?.length) break;
              packsToRun = pJson.packs;
              {
                const preLatest = await wallet.connection.getLatestBlockhash(
                  "confirmed",
                );
                let preOk = true;
                for (const pack of packsToRun) {
                  const tx = restampVersionedTx(
                    decodeSwapTxBase64(pack.swapTransaction),
                    preLatest.blockhash,
                  );
                  const sim = await simulateVersionedTxWithRetry(
                    wallet.connection,
                    tx,
                  );
                  if (!sim.ok) {
                    preOk = false;
                    break;
                  }
                  await new Promise((r) => setTimeout(r, 100));
                }
                if (!preOk) break;
              }
            }

            await runPackSignLoop(wave);
            if (userRejected) break;
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
          const merged = mergeCheckpointLegs(params.existingCheckpoint, cp.legs);
          if (isSell) {
            merged.confirmCount = Math.max(
              merged.confirmCount ?? 0,
              confirmCount,
              params.existingCheckpoint.confirmCount ?? 0,
            );
          }
          cp = merged;
        } else if (isSell) {
          cp.confirmCount = Math.max(cp.confirmCount ?? 0, confirmCount);
        }
        saveCheckpoint(cp);

        const confirmed = legResults.filter((l) => l.status === "confirmed");
        const confirmedCount = confirmed.length;

        // Inventory gate: never claim complete while any intended sleeve is wrong.
        // Sell success uses original full intent (cp.intendedKeys), not this quote alone.
        const sellIntentKeys =
          (cp.intendedKeys as DegenSolanaMintKey[] | undefined) ?? intendedKeys;
        const inventoryHeld = heldNonDustCount(balAfter.tokens ?? []);
        const cpKeysOk =
          params.side === "buy"
            ? (cp.intendedKeys ?? DEGEN_SOLANA_BASKET.map((m) => m.key)).every(
                (k) => cp.legs.find((l) => l.key === k)?.status === "confirmed",
              ) &&
              (cp.intendedKeys?.length ?? 0) === basketSize
            : sellIntentKeys.every((k) => {
                const tok = (balAfter.tokens ?? []).find((t) => t.key === k);
                const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === k);
                const dust = dustThresholdRaw(meta?.decimals ?? 6);
                return BigInt(tok?.amount ?? "0") <= dust;
              });

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

        // Explicit dust / leftover inventory for sell-100 success gate messaging.
        let dustNote = "";
        if (
          params.side === "sell" &&
          sellPctFinal >= 100 &&
          !allCpConfirmed
        ) {
          const leftovers = sellIntentKeys
            .map((key) => {
              const t = (balAfter.tokens ?? []).find((x) => x.key === key);
              const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === key);
              const dust = dustThresholdRaw(meta?.decimals ?? 6);
              const amt = BigInt(t?.amount ?? "0");
              if (amt <= BigInt(0)) return null;
              const ticker = meta?.ticker ?? key;
              if (amt <= dust) {
                return `${ticker} dust ${amt.toString()} raw`;
              }
              return `${ticker} ${amt.toString()} raw (still sellable)`;
            })
            .filter(Boolean);
          if (leftovers.length > 0) {
            dustNote = ` · leftovers: ${leftovers.join(", ")}`;
          }
        }

        const leftoverNote =
          !allCpConfirmed && failedTickers.length > 0
            ? ` · remaining: ${[...new Set(failedTickers)].join(", ")}`
            : !allCpConfirmed && dustNote
              ? dustNote
              : !allCpConfirmed &&
                  params.side === "sell" &&
                  sellPctFinal >= 100 &&
                  inventoryHeld > 0
                ? ` · ${inventoryHeld} asset(s) still held`
                : "";

        const phase = allCpConfirmed
          ? params.side === "buy"
            ? "Buy complete"
            : sellPctFinal >= 100
              ? inventoryHeld === 0
                ? "Sell All complete"
                : "Sell All complete (dust only remaining)"
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
    const heldPartial = (balances?.tokens ?? []).filter((t) => {
      const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === t.key);
      return BigInt(t.amount) > dustThresholdRaw(meta?.decimals ?? 6);
    }).length;
    const buyPartial =
      buyUnfinished ||
      (Boolean(buyCp) &&
        heldPartial > 0 &&
        heldPartial < DEGEN_SOLANA_BASKET.length);
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

        // Balance reconcile (mirror buy): dust / zero means sold.
        const balRes = await fetch(
          `/api/degen-solana/balances?owner=${encodeURIComponent(pk)}`,
        );
        const balJson = (await balRes.json()) as {
          tokens?: Array<{ key: string; amount: string }>;
        };
        for (const leg of cp.legs) {
          const tok = (balJson.tokens ?? []).find((t) => t.key === leg.key);
          const now = BigInt(tok?.amount ?? "0");
          const dust = dustThresholdRaw(
            DEGEN_SOLANA_BASKET.find((m) => m.key === leg.key)?.decimals ?? 6,
          );
          if (now <= dust) {
            leg.status = "confirmed";
            leg.error = undefined;
          } else if (
            leg.status === "confirmed" &&
            (cp.sellPct ?? 100) >= 100 &&
            now > dust
          ) {
            leg.status = "failed";
            leg.error = "Still held above dust — will retry";
          }
        }
        saveCheckpoint(cp);

        const stillHeld = unfinishedLegs(cp).filter((l) => {
          const tok = (balJson.tokens ?? []).find((t) => t.key === l.key);
          const dust = dustThresholdRaw(
            DEGEN_SOLANA_BASKET.find((m) => m.key === l.key)?.decimals ?? 6,
          );
          return BigInt(tok?.amount ?? "0") > dust;
        });
        if (stillHeld.length === 0 && (cp.sellPct ?? 100) >= 100) {
          clearCheckpoint(pk, "sell");
          await refreshBalances();
          return {
            confirmCount: cp.confirmCount,
            legs: cp.legs.map((l) => ({
              key: l.key,
              ticker: tickerForKey(l.key),
              status: l.status,
              signature: l.signature,
            })),
            heldCount: 0,
            basketSize: cp.intendedKeys?.length ?? cp.legs.length,
            complete: true,
          };
        }
      }

      const onlyKeys = cp
        ? unfinishedLegs(cp)
            .map((l) => l.key)
            .filter((key) => {
              // unfinishedLegs already filtered; keep keys that still need sell
              return true;
            })
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

  const buy = useCallback(
    async (solLamports: string, slippageBps?: number, weightsPct?: number[]) => {
      const pk = wallet.publicKey;
      if (pk) {
        const cp = loadCheckpoint(pk, "buy");
        if (cp && unfinishedLegs(cp).length > 0) {
          return finishIncomplete("buy");
        }
      }
      return runSide({ side: "buy", solLamports, slippageBps, weightsPct });
    },
    [finishIncomplete, runSide, wallet.publicKey],
  );

  const sellPercent = useCallback(
    async (pct: number, slippageBps?: number) => {
      const sellPct = Math.min(100, Math.max(1, Math.round(pct)));
      const pk = wallet.publicKey;
      if (pk && sellPct >= 100) {
        const cp = loadCheckpoint(pk, "sell");
        if (cp && unfinishedLegs(cp).length > 0) {
          return finishIncomplete("sell");
        }
      }
      return runSide({ side: "sell", slippageBps, sellPct });
    },
    [finishIncomplete, runSide, wallet.publicKey],
  );

  const sellAll = useCallback(
    (slippageBps?: number) => sellPercent(100, slippageBps),
    [sellPercent],
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
