import "server-only";

import { STABLE_CLUB_CHAIN_ID } from "@/lib/stable-club/constants";

export type StableClubServerConfig = {
  devEnabled: boolean;
  baseRpcConfigured: boolean;
  chainId: number;
  feeRecipient: `0x${string}` | null;
};

function readPublicAddress(name: string): `0x${string}` | null {
  const value = process.env[name]?.trim();
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value as `0x${string}`;
}

/** Server-only Stable Club configuration. Never logs RPC URLs or API keys. */
export function getStableClubServerConfig(): StableClubServerConfig {
  const devEnabled =
    process.env.STABLE_CLUB_DEV_ENABLED === "1" ||
    process.env.STABLE_CLUB_DEV_ENABLED?.toLowerCase() === "true";

  return {
    devEnabled,
    baseRpcConfigured: Boolean(process.env.BASE_RPC_URL?.trim()),
    chainId: STABLE_CLUB_CHAIN_ID,
    feeRecipient: readPublicAddress("STABLE_CLUB_FEE_RECIPIENT"),
  };
}

export function getBaseRpcUrlForServer(): string | null {
  const url = process.env.BASE_RPC_URL?.trim();
  return url && url.length > 0 ? url : null;
}
