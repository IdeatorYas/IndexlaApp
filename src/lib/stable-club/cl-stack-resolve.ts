/**
 * Resolve which CL executor stack to use for deposit/exit.
 * Primary (pinned) stack supports partial %; legacy stack is 100%-only for
 * strategies whose legs still pin pre-cutover adapters (IDs non-recyclable).
 */
import type { Address } from "viem";
import { getAddress } from "viem";
import type {
  Phase2aAdapterDeployment,
  StableClubPhase2aDeployments,
  StableClubPhase2aPublicDeployments,
} from "@/lib/stable-club/phase2a-deployments";

export type StableClubClStackKind = "primary" | "legacy";

export type ResolvedClStack = {
  kind: StableClubClStackKind;
  clExecutor: Address;
  /** Partial % USDC exit is only safe on the primary (decreaseLiquidityTo) stack. */
  percentExitAllowed: boolean;
};

function norm(a: Address | string): string {
  return getAddress(a as Address).toLowerCase();
}

function adapterSet(
  adapters: readonly Phase2aAdapterDeployment[] | undefined,
): Set<string> {
  const s = new Set<string>();
  for (const a of adapters ?? []) {
    if (a?.adapter) s.add(norm(a.adapter));
  }
  return s;
}

export function listDiscoveryAdapters(
  deployments: StableClubPhase2aPublicDeployments | StableClubPhase2aDeployments,
): Phase2aAdapterDeployment[] {
  const primary = deployments.adapters ?? [];
  const legacy = deployments.legacyExitStack?.adapters ?? [];
  const seen = new Set<string>();
  const out: Phase2aAdapterDeployment[] = [];
  for (const a of [...primary, ...legacy]) {
    const k = norm(a.adapter);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

export function findDiscoveryAdapterMeta(
  deployments: StableClubPhase2aPublicDeployments | StableClubPhase2aDeployments,
  adapter: Address,
): Phase2aAdapterDeployment | undefined {
  const key = norm(adapter);
  return listDiscoveryAdapters(deployments).find((a) => norm(a.adapter) === key);
}

/**
 * Pick executor from live strategy/position adapter addresses.
 */
export function resolveClStackForAdapters(
  deployments: StableClubPhase2aPublicDeployments | StableClubPhase2aDeployments,
  adapters: readonly Address[],
): ResolvedClStack {
  const live = adapters
    .filter((a) => a && a !== "0x0000000000000000000000000000000000000000")
    .map((a) => norm(a));
  if (live.length === 0) {
    return {
      kind: "primary",
      clExecutor: deployments.clExecutor,
      percentExitAllowed: deployments.features?.exitPercentToUsdc === true,
    };
  }

  const primary = adapterSet(deployments.adapters);
  const legacy = adapterSet(deployments.legacyExitStack?.adapters);
  const allPrimary = live.every((a) => primary.has(a));
  const allLegacy = live.every((a) => legacy.has(a));

  if (allPrimary) {
    return {
      kind: "primary",
      clExecutor: deployments.clExecutor,
      percentExitAllowed: deployments.features?.exitPercentToUsdc === true,
    };
  }
  if (allLegacy && deployments.legacyExitStack?.clExecutor) {
    return {
      kind: "legacy",
      clExecutor: deployments.legacyExitStack.clExecutor,
      percentExitAllowed: false,
    };
  }
  throw new Error(
    "Position adapters span unknown or mixed CL stacks. Contact IndexLa support before withdrawing.",
  );
}
