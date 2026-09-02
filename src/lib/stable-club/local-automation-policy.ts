/**
 * Launch automation policy — fail-closed unless launch params enable a feature
 * or an explicit test/audit-only bypass is set on a hardhat-local deployment.
 */
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";
import {
  PRIVATE_BETA_LAUNCH_PARAMS,
  type StableClubLaunchParams,
} from "@/lib/stable-club/launch-params";

export const LOCAL_AUTOMATION_BYPASS_DEFAULT = false as const;

export type AutomationKind = "harvest" | "compound" | "rebalance";

const PRODUCTION_NETWORKS = new Set<string>(["base", "mainnet"]);
const BASE_MAINNET_CHAIN_ID = 8453;

/**
 * Explicit opt-in for local harvest/compound/rebalance while launch flags remain false.
 * Default is always false. Production networks and Base mainnet chain id never qualify.
 */
export function isExplicitLocalAutomationBypassAllowed(
  deployments: StableClubLocalDeployments | null | undefined,
): boolean {
  if (deployments?.localAutomationBypass !== true) return false;
  if (!deployments.isTestOnly) return false;
  if (deployments.chainId === BASE_MAINNET_CHAIN_ID) return false;
  if (PRODUCTION_NETWORKS.has(deployments.network)) return false;
  if (deployments.network !== "hardhat-local") return false;
  return true;
}

export function isLaunchAutomationEnabledForEnvironment(
  kind: AutomationKind,
  deployments: StableClubLocalDeployments | null | undefined,
  params: StableClubLaunchParams = PRIVATE_BETA_LAUNCH_PARAMS,
): boolean {
  const launchFlag =
    kind === "harvest"
      ? params.automation.harvestEnabled
      : kind === "compound"
        ? params.automation.compoundEnabled
        : params.automation.rebalanceEnabled;
  if (launchFlag === true) return true;
  return isExplicitLocalAutomationBypassAllowed(deployments);
}

export function launchAutomationDisabledCode(kind: AutomationKind): string {
  return kind === "harvest"
    ? "launch-harvest-disabled"
    : kind === "compound"
      ? "launch-compound-disabled"
      : "launch-rebalance-disabled";
}

export function launchAutomationDisabledReason(kind: AutomationKind): string {
  return kind === "harvest"
    ? "Launch policy disables harvest automation"
    : kind === "compound"
      ? "Launch policy disables compound automation"
      : "Launch policy disables rebalance automation";
}
