import { STABLE_CLUB_LOCAL_CHAIN_ID } from "@/lib/stable-club/constants";

/** Hardhat local chain — dev engineering panels must never target Base mainnet. */
export const STABLE_CLUB_DEV_PANEL_CHAIN_ID = STABLE_CLUB_LOCAL_CHAIN_ID;

export function isStableClubDevFlagEnabled(
  devFlagEnabled = readStableClubDevFlagFromEnv(),
): boolean {
  return devFlagEnabled;
}

export function readStableClubDevFlagFromEnv(): boolean {
  const raw = process.env.STABLE_CLUB_DEV_ENABLED;
  return raw === "1" || raw?.toLowerCase() === "true";
}

export function isLocalhostHost(host: string | null | undefined): boolean {
  const normalized = (host ?? "").toLowerCase().split(":")[0] ?? "";
  return normalized === "localhost" || normalized === "127.0.0.1";
}

export type StableClubDevPanelAccessInput = {
  nodeEnv?: string;
  host?: string | null;
  devFlagEnabled?: boolean;
  /** When set, must equal Hardhat 31337 (never Base 8453). */
  walletChainId?: number | null;
};

/**
 * Dev quote/deposit engineering UI — fail-closed outside local Hardhat.
 * Never exposed on production or non-localhost hosts, even if STABLE_CLUB_DEV_ENABLED is set.
 */
export function canExposeStableClubDevPanel(input: StableClubDevPanelAccessInput): boolean {
  if (input.nodeEnv === "production") return false;
  if (!isStableClubDevFlagEnabled(input.devFlagEnabled)) return false;
  if (!isLocalhostHost(input.host)) return false;
  if (
    input.walletChainId != null &&
    input.walletChainId !== STABLE_CLUB_DEV_PANEL_CHAIN_ID
  ) {
    return false;
  }
  return true;
}

/** Client-side: derive host from browser location. */
export function canExposeStableClubDevPanelInBrowser(input: {
  hostname?: string;
  devFlagEnabled: boolean;
  walletChainId?: number | null;
}): boolean {
  return canExposeStableClubDevPanel({
    nodeEnv: process.env.NODE_ENV,
    host: input.hostname ?? null,
    devFlagEnabled: input.devFlagEnabled,
    walletChainId: input.walletChainId,
  });
}
