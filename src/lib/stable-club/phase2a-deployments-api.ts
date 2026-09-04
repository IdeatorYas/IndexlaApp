/**
 * Phase 2a deployments API resolution — production vs local separation.
 * Production never reads gitignored local JSON; Base trust comes only from
 * {@link getTrustedPhase2aBaseManifest}.
 */
import {
  canExposeStableClubDevPanel,
  type StableClubDevPanelAccessInput,
} from "@/lib/stable-club/dev-panel-access";
import {
  getTrustedPhase2aBaseManifest,
  isValidPhase2aDeployments,
  toPublicPhase2aDeploymentsPayload,
  type StableClubPhase2aDeployments,
  type StableClubPhase2aPublicDeployments,
  type TrustedPhase2aBaseManifest,
} from "@/lib/stable-club/phase2a-deployments";
import { BASE_CHAIN_ID } from "@/lib/stable-club/verified-base-addresses";
import { LOCAL_HARDHAT_CHAIN_ID, LOCAL_HARDHAT_NETWORK } from "@/lib/stable-club/chain-isolation";

export const LOCAL_PHASE2A_DEPLOYMENTS_RELATIVE_PATH =
  "src/lib/stable-club/generated/local-phase2a-deployments.json";

export const PHASE2A_BASE_UNAVAILABLE_MESSAGE =
  "Base Phase 2a deployments unavailable until a trusted production manifest is pinned.";

export const PHASE2A_LOCAL_UNAVAILABLE_MESSAGE =
  "Phase 2a local deployments not found or invalid. Deploy the five-pool stack and generate local-phase2a-deployments.json.";

export type Phase2aDeploymentsApiBody =
  | { configured: false; message: string }
  | { configured: true; deployments: StableClubPhase2aPublicDeployments }
  | { error: string };

export type Phase2aDeploymentsApiResult = {
  status: number;
  body: Phase2aDeploymentsApiBody;
};

function isLocalTestOnlyDeployments(value: StableClubPhase2aDeployments): boolean {
  return (
    value.isTestOnly === true &&
    value.network === LOCAL_HARDHAT_NETWORK &&
    value.chainId === LOCAL_HARDHAT_CHAIN_ID
  );
}

/**
 * Runtime-only local JSON loader. Never import the file statically (gitignored).
 * Fail-closed on missing, unreadable, or malformed content.
 * Rejects Base / non-test payloads so local files cannot enter production serving.
 */
export function parseLocalPhase2aDeploymentsJson(
  raw: string,
): StableClubPhase2aDeployments | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as StableClubPhase2aDeployments;
  if (
    candidate.network === "base" ||
    candidate.chainId === BASE_CHAIN_ID ||
    candidate.isTestOnly === false
  ) {
    return null;
  }
  if (!isValidPhase2aDeployments(candidate)) return null;
  if (!isLocalTestOnlyDeployments(candidate)) return null;
  return candidate;
}

export function readLocalPhase2aDeploymentsFromDisk(params: {
  filePath: string;
  readFileSync: (path: string, encoding: "utf8") => string;
}): StableClubPhase2aDeployments | null {
  try {
    const raw = params.readFileSync(params.filePath, "utf8");
    return parseLocalPhase2aDeploymentsJson(raw);
  } catch {
    return null;
  }
}

export type ResolvePhase2aDeploymentsApiInput = {
  nodeEnv?: string;
  host?: string | null;
  devFlagEnabled: boolean;
  getTrustedManifest?: () => TrustedPhase2aBaseManifest | null;
  /** Dev/E2E only — must never be invoked when nodeEnv === "production". */
  loadLocalDeployments?: () => StableClubPhase2aDeployments | null;
};

/**
 * Resolve the Phase 2a deployments API response.
 * - Production: trusted manifest only; local JSON is never read.
 * - Dev/E2E (localhost + flag): optional local Hardhat JSON at runtime.
 */
export function resolvePhase2aDeploymentsApiResponse(
  input: ResolvePhase2aDeploymentsApiInput,
): Phase2aDeploymentsApiResult {
  const getTrusted = input.getTrustedManifest ?? getTrustedPhase2aBaseManifest;

  if (input.nodeEnv === "production") {
    // Fail closed: never call loadLocalDeployments in production.
    const trusted = getTrusted();
    if (trusted == null) {
      return {
        status: 200,
        body: {
          configured: false,
          message: PHASE2A_BASE_UNAVAILABLE_MESSAGE,
        },
      };
    }
    // Trusted root alone is not a full public deployments payload.
    // Do not invent addresses — keep deposits disabled until an explicit mapper exists.
    return {
      status: 200,
      body: {
        configured: false,
        message: PHASE2A_BASE_UNAVAILABLE_MESSAGE,
      },
    };
  }

  const access: StableClubDevPanelAccessInput = {
    nodeEnv: input.nodeEnv,
    host: input.host,
    devFlagEnabled: input.devFlagEnabled,
  };
  if (!canExposeStableClubDevPanel(access)) {
    return { status: 404, body: { error: "Not found" } };
  }

  const local = input.loadLocalDeployments?.() ?? null;
  if (!local || !isLocalTestOnlyDeployments(local) || !isValidPhase2aDeployments(local)) {
    return {
      status: 200,
      body: {
        configured: false,
        message: PHASE2A_LOCAL_UNAVAILABLE_MESSAGE,
      },
    };
  }

  return {
    status: 200,
    body: {
      configured: true,
      deployments: toPublicPhase2aDeploymentsPayload(local),
    },
  };
}
