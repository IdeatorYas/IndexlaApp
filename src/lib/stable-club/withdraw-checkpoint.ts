/**
 * Persist interrupted legacy owner-NPM withdraw progress so Resume can finish
 * remaining LPs and convert only withdrawal residue (delta over baseline).
 *
 * v2: per-tokenId completion keys. v1 NPM-only checkpoints are intentionally
 * dropped (poisoned Aero credits skipped still-open tokenIds).
 */
import type { Address } from "viem";

export const WITHDRAW_CHECKPOINT_VERSION = 2 as const;
export const WITHDRAW_CHECKPOINT_KEY_PREFIX =
  "indexla.stableClub.withdrawCheckpoint.v2." as const;
/** Legacy v1 key — cleared on write so Resume is not dual-sourced. */
export const WITHDRAW_CHECKPOINT_V1_KEY_PREFIX =
  "indexla.stableClub.withdrawCheckpoint.v1." as const;

export type WithdrawCheckpointPhase =
  | "npm"
  | "recover"
  | "complete"
  | "failed_incomplete";

export type WithdrawCheckpoint = {
  version: typeof WITHDRAW_CHECKPOINT_VERSION;
  wallet: Address;
  chainId: number;
  percent: number;
  startedAt: number;
  updatedAt: number;
  phase: WithdrawCheckpointPhase;
  /** Balances before any NPM exit — recover only max(0, current - baseline). */
  baseline: {
    usdc: string;
    cbBtc: string;
    weth: string;
  };
  /**
   * Completed position keys `${npm.toLowerCase()}:${tokenId}`.
   * Never NPM-only — that skipped still-open Aero NFTs after an earlier token.
   */
  completedPositionKeys: string[];
  lastError?: string;
};

export function withdrawCheckpointStorageKey(
  wallet: Address,
  chainId: number,
): string {
  return `${WITHDRAW_CHECKPOINT_KEY_PREFIX}${chainId}:${wallet.toLowerCase()}`;
}

function withdrawCheckpointV1StorageKey(
  wallet: Address,
  chainId: number,
): string {
  return `${WITHDRAW_CHECKPOINT_V1_KEY_PREFIX}${chainId}:${wallet.toLowerCase()}`;
}

export function readWithdrawCheckpoint(
  wallet: Address,
  chainId: number,
): WithdrawCheckpoint | null {
  if (typeof window === "undefined") return null;
  try {
    // Drop poisoned v1 NPM-only checkpoints — do not migrate.
    window.localStorage.removeItem(
      withdrawCheckpointV1StorageKey(wallet, chainId),
    );
    const raw = window.localStorage.getItem(
      withdrawCheckpointStorageKey(wallet, chainId),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WithdrawCheckpoint;
    if (
      parsed.version !== WITHDRAW_CHECKPOINT_VERSION ||
      parsed.wallet.toLowerCase() !== wallet.toLowerCase() ||
      parsed.chainId !== chainId ||
      !Array.isArray(parsed.completedPositionKeys)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeWithdrawCheckpoint(cp: WithdrawCheckpoint): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(
      withdrawCheckpointV1StorageKey(cp.wallet, cp.chainId),
    );
    window.localStorage.setItem(
      withdrawCheckpointStorageKey(cp.wallet, cp.chainId),
      JSON.stringify({ ...cp, updatedAt: Date.now() }),
    );
  } catch {
    // private mode / quota — resume still works within the same session via React state
  }
}

export function clearWithdrawCheckpoint(wallet: Address, chainId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(
      withdrawCheckpointStorageKey(wallet, chainId),
    );
    window.localStorage.removeItem(
      withdrawCheckpointV1StorageKey(wallet, chainId),
    );
  } catch {
    // ignore
  }
}

export function residueFromBaseline(params: {
  current: bigint;
  baseline: bigint;
}): bigint {
  return params.current > params.baseline
    ? params.current - params.baseline
    : BigInt(0);
}

export function isCheckpointIncomplete(
  cp: WithdrawCheckpoint | null,
): boolean {
  if (!cp) return false;
  return (
    cp.phase === "npm" ||
    cp.phase === "recover" ||
    cp.phase === "failed_incomplete"
  );
}

export function positionCompletionKey(npm: string, tokenId: bigint): string {
  return `${npm.toLowerCase()}:${tokenId.toString()}`;
}
