import type { DegenSolanaMintKey } from "@/lib/degen-solana/constants";

export type LegStatus =
  | "pending"
  | "submitted"
  | "confirmed"
  | "failed"
  | "expired";

export type CheckpointLeg = {
  key: DegenSolanaMintKey;
  mint: string;
  amountIn: string;
  status: LegStatus;
  signature?: string;
  error?: string;
  /** Baseline raw token balance before this buy intent (for attributable delta). */
  baselineAmount?: string;
};

export type DegenSolanaCheckpoint = {
  intentId: string;
  side: "buy" | "sell";
  wallet: string;
  createdAt: number;
  updatedAt: number;
  confirmCount: number;
  legs: CheckpointLeg[];
  /** Buy: original gross SOL + weights so Finish does not invent 0% legs. */
  solLamports?: string;
  weightsPct?: number[];
  slippageBps?: number;
  intendedKeys?: DegenSolanaMintKey[];
};

const PREFIX = "indexla:degen-solana:";

export function checkpointStorageKey(
  wallet: string,
  side: "buy" | "sell",
): string {
  return `${PREFIX}${side}:${wallet}`;
}

export function loadCheckpoint(
  wallet: string,
  side: "buy" | "sell",
): DegenSolanaCheckpoint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      checkpointStorageKey(wallet, side),
    );
    if (!raw) return null;
    return JSON.parse(raw) as DegenSolanaCheckpoint;
  } catch {
    return null;
  }
}

export function saveCheckpoint(cp: DegenSolanaCheckpoint): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    checkpointStorageKey(cp.wallet, cp.side),
    JSON.stringify({ ...cp, updatedAt: Date.now() }),
  );
}

export function clearCheckpoint(wallet: string, side: "buy" | "sell"): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(checkpointStorageKey(wallet, side));
}

/** Legs that still need a new quote/send (not confirmed). */
export function unfinishedLegs(cp: DegenSolanaCheckpoint): CheckpointLeg[] {
  return cp.legs.filter(
    (l) =>
      l.status === "pending" ||
      l.status === "failed" ||
      l.status === "expired" ||
      l.status === "submitted",
  );
}

/** Submitted or unknown — must reconcile on-chain before re-quoting. */
export function submittedLegs(cp: DegenSolanaCheckpoint): CheckpointLeg[] {
  return cp.legs.filter((l) => l.status === "submitted");
}

/** Merge finish attempt into the original intent — never drop confirmed legs. */
export function mergeCheckpointLegs(
  existing: DegenSolanaCheckpoint,
  updates: CheckpointLeg[],
): DegenSolanaCheckpoint {
  const byKey = new Map(existing.legs.map((l) => [l.key, { ...l }]));
  for (const u of updates) {
    const prev = byKey.get(u.key);
    if (prev?.status === "confirmed" && u.status !== "confirmed") {
      continue;
    }
    byKey.set(u.key, { ...prev, ...u });
  }
  return {
    ...existing,
    updatedAt: Date.now(),
    legs: existing.intendedKeys
      ? existing.intendedKeys.map(
          (k) => byKey.get(k) ?? existing.legs.find((l) => l.key === k)!,
        ).filter(Boolean)
      : [...byKey.values()],
  };
}
