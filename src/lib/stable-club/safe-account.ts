/**
 * Safe / EOA account mode for Stable Club permissions.
 * Mainnet: Safe required as perm.user. Local/testnet: EOA legacy allowed.
 */
import type { Address } from "viem";
import type { DeploymentEnvironment } from "@/lib/stable-club/production-guards";
import { isStage0EoaEnvironment } from "@/lib/stable-club/production-guards";

export type StableClubAccountMode = "safe" | "eoa-legacy";

export function resolveAccountMode(params: {
  environment: DeploymentEnvironment;
  preferSafe: boolean;
  connectedAddressIsContract: boolean;
}): StableClubAccountMode {
  if (params.environment === "mainnet") return "safe";
  if (params.preferSafe && params.connectedAddressIsContract) return "safe";
  if (isStage0EoaEnvironment(params.environment)) return "eoa-legacy";
  return "safe";
}

export function assertPermissionUserAllowed(params: {
  environment: DeploymentEnvironment;
  permissionUser: Address;
  connectedAddress: Address;
  permissionUserIsContract: boolean;
}): void {
  if (params.permissionUser.toLowerCase() !== params.connectedAddress.toLowerCase()) {
    throw new Error("Connected wallet must equal permission user (Safe or EOA)");
  }
  if (params.environment === "mainnet" && !params.permissionUserIsContract) {
    throw new Error("Mainnet requires a Safe (smart account) as perm.user — EOAs blocked");
  }
}

export function formatPermissionUserLabel(mode: StableClubAccountMode, address: Address): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return mode === "safe" ? `Safe ${short}` : `EOA (local/test) ${short}`;
}
