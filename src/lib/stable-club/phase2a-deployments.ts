/**
 * Phase 2a/2b deployment payload validation + on-chain attestation (SC-F09).
 * Shape checks first; executable trust requires separate bytecode attestation.
 * Base addresses/hashes come only from the source-controlled trusted manifest — never from JSON.
 */
import { getAddress, keccak256, type Address, type Hex } from "viem";
import { STABLE_CLUB_BASE_RPC_PROXY_PATH } from "@/lib/stable-club/base-rpc-client";
import {
  assertLocalHardhatDeploymentIdentity,
  assertLocalMockPermit2Allowed,
  LOCAL_HARDHAT_CHAIN_ID,
  LOCAL_HARDHAT_NETWORK,
} from "@/lib/stable-club/chain-isolation";
import { isNonZeroAddress, ZERO_ADDRESS } from "@/lib/stable-club/nft-approval";
import { BASE_CHAIN_ID, BASE_PERMIT2, BASE_TOKENS, isCanonicalBasePermit2 } from "@/lib/stable-club/verified-base-addresses";
import { TRUSTED_PHASE2A_BASE_MANIFEST } from "@/lib/stable-club/trusted-phase2a-base-manifest";

export const PHASE2A_BASE_NETWORK = "base" as const;

export type Phase2aAdapterDeployment = {
  poolId: Hex;
  protocol: string;
  adapter: Address;
  tokenA: Address;
  tokenB: Address;
  factory: Address;
  npm: Address;
  router: Address;
};

export type Phase2aRouteDeployment = {
  name: string;
  routeId: Hex;
  enabled: boolean;
};

export type StableClubPhase2aDeployments = {
  chainId: number;
  network: string;
  isTestOnly: boolean;
  label: string;
  deployedAt: string;
  deployer: Address;
  testUser: Address;
  feeRecipient: Address;
  permissionRegistry: Address;
  strategyRegistry: Address;
  feeRouter: Address;
  swapRouter: Address;
  clExecutor: Address;
  oracleGuard: Address;
  mevGuard: Address;
  safetyController: Address;
  permit2: Address;
  canonicalBasePermit2: Address;
  usdc: Address;
  cbbtc: Address;
  weth: Address;
  poolIds: Hex[];
  adapters: Phase2aAdapterDeployment[];
  routes: Phase2aRouteDeployment[];
  strategyKind: Hex;
  rpcUrl?: string;
  /**
   * Trusted earliest block for NFT Transfer log discovery (must be > 0).
   * Required on non-local networks; optional on hardhat-local 31337 (defaults to 1).
   */
  discoveryStartBlock?: number | string;
  /**
   * Explicit product feature flags. Base deposits/actions stay off until
   * `exitAllToUsdc` is true after Safe-owned cutover + live E2E proof.
   */
  features?: {
    exitAllToUsdc?: boolean;
    /** Partial % USDC exit — enable only after Safe cutover. */
    exitPercentToUsdc?: boolean;
  };
};

/** Core IndexLa + Permit2 contracts attested on every network. */
export const PHASE2A_CORE_ATTESTATION_KEYS = [
  "permissionRegistry",
  "strategyRegistry",
  "feeRouter",
  "swapRouter",
  "clExecutor",
  "oracleGuard",
  "mevGuard",
  "safetyController",
  "permit2",
] as const;

export type Phase2aCoreAttestationKey = (typeof PHASE2A_CORE_ATTESTATION_KEYS)[number];

/**
 * Source-controlled Base trust root for Phase 2a INDEXLA stack.
 * Expected addresses + runtime keccak256 hashes — never read from deployment JSON.
 * `null` from {@link getTrustedPhase2aBaseManifest} ⇒ Base fail-closed.
 */
export type TrustedPhase2aBaseManifest = {
  chainId: typeof BASE_CHAIN_ID;
  network: typeof PHASE2A_BASE_NETWORK;
  isTestOnly: false;
  contracts: {
    permissionRegistry: Address;
    strategyRegistry: Address;
    feeRouter: Address;
    swapRouter: Address;
    clExecutor: Address;
    oracleGuard: Address;
    mevGuard: Address;
    safetyController: Address;
    permit2: Address;
    usdc: Address;
    cbbtc: Address;
    weth: Address;
    /** Exactly five CL adapter addresses, leg order. */
    adapters: readonly [Address, Address, Address, Address, Address];
  };
  /** keccak256(runtime bytecode), keyed by checksummed or lowercase address. */
  runtimeCodeHashes: Readonly<Record<string, Hex>>;
};

/**
 * Trust root accessor — pinned from verified Base mainnet deploy artifact.
 * Do not invent addresses or hashes here.
 */
export function getTrustedPhase2aBaseManifest(): TrustedPhase2aBaseManifest | null {
  return TRUSTED_PHASE2A_BASE_MANIFEST;
}

function sameAddr(a: Address | string, b: Address | string): boolean {
  return getAddress(a as Address) === getAddress(b as Address);
}

function hasShape(value: StableClubPhase2aDeployments): boolean {
  if (value.adapters?.length !== 5 || value.poolIds?.length !== 5) return false;
  const required: (keyof StableClubPhase2aDeployments)[] = [
    "permissionRegistry",
    "strategyRegistry",
    "feeRouter",
    "swapRouter",
    "clExecutor",
    "oracleGuard",
    "mevGuard",
    "safetyController",
    "permit2",
    "usdc",
    "cbbtc",
    "weth",
  ];
  for (const key of required) {
    const addr = value[key];
    if (typeof addr !== "string" || !isNonZeroAddress(addr as Address)) return false;
  }
  for (const a of value.adapters) {
    if (!isNonZeroAddress(a.adapter) || a.adapter === ZERO_ADDRESS) return false;
    if (!isNonZeroAddress(a.tokenA) || !isNonZeroAddress(a.tokenB)) return false;
  }
  return true;
}

function assertBasePhase2aShapeIdentity(value: StableClubPhase2aDeployments): void {
  if (value.isTestOnly !== false) {
    throw new Error("Base Phase 2a deployment must set isTestOnly=false");
  }
  if (value.network !== PHASE2A_BASE_NETWORK) {
    throw new Error(`Base Phase 2a network must be "${PHASE2A_BASE_NETWORK}"`);
  }
  if (value.chainId !== BASE_CHAIN_ID) {
    throw new Error(`Base Phase 2a chainId must be ${BASE_CHAIN_ID}`);
  }
  if (!isCanonicalBasePermit2(value.permit2)) {
    throw new Error("Base Phase 2a permit2 must be canonical Base Permit2");
  }
  if (!sameAddr(value.canonicalBasePermit2, BASE_PERMIT2.address)) {
    throw new Error("Base Phase 2a canonicalBasePermit2 mismatch");
  }
  if (!sameAddr(value.usdc, BASE_TOKENS.usdc)) {
    throw new Error("Base Phase 2a usdc must match trusted Base catalogue");
  }
  if (!sameAddr(value.cbbtc, BASE_TOKENS.cbBtc)) {
    throw new Error("Base Phase 2a cbbtc must match trusted Base catalogue");
  }
  if (!sameAddr(value.weth, BASE_TOKENS.weth)) {
    throw new Error("Base Phase 2a weth must match trusted Base catalogue");
  }
}

/**
 * Shape + identity validation only (no RPC).
 * Local: hardhat-local / 31337 / isTestOnly.
 * Base: base / 8453 / !isTestOnly + catalogue tokens/Permit2.
 */
export function isValidPhase2aDeployments(
  value: StableClubPhase2aDeployments | null | undefined,
): value is StableClubPhase2aDeployments {
  if (!value) return false;
  if (!hasShape(value)) return false;

  if (
    value.network === LOCAL_HARDHAT_NETWORK ||
    value.chainId === LOCAL_HARDHAT_CHAIN_ID ||
    value.isTestOnly === true
  ) {
    try {
      assertLocalHardhatDeploymentIdentity({
        chainId: value.chainId,
        network: value.network,
        isTestOnly: value.isTestOnly,
      });
      assertLocalMockPermit2Allowed({
        chainId: value.chainId,
        network: value.network,
        permit2: value.permit2,
        isTestOnly: value.isTestOnly,
      });
    } catch {
      return false;
    }
    return true;
  }

  if (value.network === PHASE2A_BASE_NETWORK || value.chainId === BASE_CHAIN_ID) {
    try {
      assertBasePhase2aShapeIdentity(value);
    } catch {
      return false;
    }
    return true;
  }

  return false;
}

/** Public API payload — no deployer/testUser secrets beyond addresses already on-chain. */
export type StableClubPhase2aPublicDeployments = Omit<
  StableClubPhase2aDeployments,
  "deployer" | "testUser"
> & {
  rpcUrl: string;
};

export function toPublicPhase2aDeploymentsPayload(
  deployments: StableClubPhase2aDeployments,
): StableClubPhase2aPublicDeployments {
  if (!isValidPhase2aDeployments(deployments)) {
    throw new Error("Invalid Phase 2a deployments payload");
  }
  if (deployments.network === LOCAL_HARDHAT_NETWORK) {
    assertLocalHardhatDeploymentIdentity({
      chainId: deployments.chainId,
      network: deployments.network,
      isTestOnly: deployments.isTestOnly,
    });
    assertLocalMockPermit2Allowed({
      chainId: deployments.chainId,
      network: deployments.network,
      permit2: deployments.permit2,
      isTestOnly: deployments.isTestOnly,
    });
  } else {
    assertBasePhase2aShapeIdentity(deployments);
  }
  return {
    chainId: deployments.chainId,
    network: deployments.network,
    isTestOnly: deployments.isTestOnly,
    label: deployments.label,
    deployedAt: deployments.deployedAt,
    feeRecipient: deployments.feeRecipient,
    permissionRegistry: deployments.permissionRegistry,
    strategyRegistry: deployments.strategyRegistry,
    feeRouter: deployments.feeRouter,
    swapRouter: deployments.swapRouter,
    clExecutor: deployments.clExecutor,
    oracleGuard: deployments.oracleGuard,
    mevGuard: deployments.mevGuard,
    safetyController: deployments.safetyController,
    permit2: deployments.permit2,
    canonicalBasePermit2: deployments.canonicalBasePermit2,
    usdc: deployments.usdc,
    cbbtc: deployments.cbbtc,
    weth: deployments.weth,
    poolIds: deployments.poolIds,
    adapters: deployments.adapters,
    routes: deployments.routes,
    strategyKind: deployments.strategyKind,
    // Base browser reads go through the same-origin proxy (BASE_RPC_URL), not public mainnet.base.org.
    rpcUrl:
      deployments.network === "base" || deployments.chainId === 8453
        ? STABLE_CLUB_BASE_RPC_PROXY_PATH
        : (deployments.rpcUrl ?? "http://127.0.0.1:8545"),
    ...(deployments.discoveryStartBlock !== undefined
      ? { discoveryStartBlock: deployments.discoveryStartBlock }
      : {}),
    ...(deployments.features !== undefined ? { features: deployments.features } : {}),
  };
}

export function isValidPhase2aPublicDeployments(
  value: StableClubPhase2aPublicDeployments | null | undefined,
): value is StableClubPhase2aPublicDeployments {
  return isValidPhase2aDeployments(value as StableClubPhase2aDeployments | null);
}

/**
 * Earliest confirmed contract-deployment receipt block for NFT log discovery.
 * Never returns 0; throws if no valid receipt blocks are provided.
 */
export function earliestDiscoveryStartBlock(
  receiptBlockNumbers: readonly (number | bigint | string)[],
): number {
  if (receiptBlockNumbers.length === 0) {
    throw new Error("discoveryStartBlock requires at least one deployment receipt block");
  }
  let min: number | null = null;
  for (const raw of receiptBlockNumbers) {
    const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid deployment receipt block: ${String(raw)}`);
    }
    if (min === null || n < min) min = n;
  }
  return min!;
}

export type Phase2aAttestationTarget = {
  key: string;
  address: Address;
};

/** Every address that must have on-chain bytecode before enabling txs. */
export function listPhase2aAttestationTargets(
  deployments: StableClubPhase2aDeployments | StableClubPhase2aPublicDeployments,
): Phase2aAttestationTarget[] {
  const targets: Phase2aAttestationTarget[] = [];
  for (const key of PHASE2A_CORE_ATTESTATION_KEYS) {
    targets.push({ key, address: deployments[key] });
  }
  targets.push({ key: "usdc", address: deployments.usdc });
  targets.push({ key: "cbbtc", address: deployments.cbbtc });
  targets.push({ key: "weth", address: deployments.weth });
  deployments.adapters.forEach((a, i) => {
    targets.push({ key: `adapter[${i}]`, address: a.adapter });
  });
  return targets;
}

export function isNonEmptyBytecode(code: Hex | string | null | undefined): boolean {
  if (code == null) return false;
  const normalized = code.toLowerCase();
  return normalized !== "" && normalized !== "0x" && normalized !== "0x0";
}

export function runtimeCodeHash(code: Hex): Hex {
  return keccak256(code);
}

export function buildPhase2aAttestationCacheKey(params: {
  chainId: number;
  addresses: readonly Address[];
  codeHashes: readonly Hex[];
}): string {
  const addrs = [...params.addresses]
    .map((a) => getAddress(a).toLowerCase())
    .sort()
    .join(",");
  const hashes = [...params.codeHashes].map((h) => h.toLowerCase()).sort().join(",");
  return `${params.chainId}|${addrs}|${hashes}`;
}

const attestationSuccessCache = new Map<string, true>();

export function clearPhase2aAttestationCache(): void {
  attestationSuccessCache.clear();
}

export function hasCachedPhase2aAttestation(cacheKey: string): boolean {
  return attestationSuccessCache.has(cacheKey);
}

export type Phase2aCodeClient = {
  getChainId: () => Promise<number>;
  getBytecode: (args: { address: Address }) => Promise<Hex | undefined>;
};

export type AttestPhase2aDeploymentsResult = {
  cacheKey: string;
  codeHashesByAddress: Record<string, Hex>;
};

function lookupTrustedHash(
  runtimeCodeHashes: Readonly<Record<string, Hex>>,
  address: Address,
): Hex | undefined {
  const checksum = getAddress(address);
  return (
    runtimeCodeHashes[checksum] ??
    runtimeCodeHashes[checksum.toLowerCase()] ??
    runtimeCodeHashes[address] ??
    runtimeCodeHashes[address.toLowerCase()]
  );
}

function assertAddressesMatchTrustedBase(
  deployments: StableClubPhase2aDeployments | StableClubPhase2aPublicDeployments,
  trusted: TrustedPhase2aBaseManifest,
): void {
  if (trusted.chainId !== BASE_CHAIN_ID || trusted.network !== PHASE2A_BASE_NETWORK) {
    throw new Error("Trusted Base manifest identity is invalid");
  }
  if (trusted.isTestOnly !== false) {
    throw new Error("Trusted Base manifest must set isTestOnly=false");
  }
  for (const key of PHASE2A_CORE_ATTESTATION_KEYS) {
    if (!sameAddr(deployments[key], trusted.contracts[key])) {
      throw new Error(`Base address mismatch for ${key}`);
    }
  }
  if (!sameAddr(deployments.usdc, trusted.contracts.usdc)) {
    throw new Error("Base address mismatch for usdc");
  }
  if (!sameAddr(deployments.cbbtc, trusted.contracts.cbbtc)) {
    throw new Error("Base address mismatch for cbbtc");
  }
  if (!sameAddr(deployments.weth, trusted.contracts.weth)) {
    throw new Error("Base address mismatch for weth");
  }
  if (trusted.contracts.adapters.length !== 5) {
    throw new Error("Trusted Base manifest must pin five adapters");
  }
  for (let i = 0; i < 5; i++) {
    if (!sameAddr(deployments.adapters[i]!.adapter, trusted.contracts.adapters[i]!)) {
      throw new Error(`Base address mismatch for adapter[${i}]`);
    }
  }
}

/**
 * Asynchronous on-chain attestation. Call after shape validation.
 * Local: non-empty bytecode at every required address.
 * Base: exact trusted-manifest addresses + runtime codehash match (fail closed if no manifest).
 */
export async function attestPhase2aDeployments(params: {
  client: Phase2aCodeClient;
  deployments: StableClubPhase2aDeployments | StableClubPhase2aPublicDeployments;
  /** Test injection only — production uses {@link getTrustedPhase2aBaseManifest}. */
  trustedBaseManifest?: TrustedPhase2aBaseManifest | null;
}): Promise<AttestPhase2aDeploymentsResult> {
  const { client, deployments } = params;
  if (!isValidPhase2aDeployments(deployments as StableClubPhase2aDeployments)) {
    throw new Error("Phase 2a deployments failed shape validation before attestation");
  }

  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Phase 2a attestation RPC error (chainId): ${detail}`);
  }
  if (chainId !== deployments.chainId) {
    throw new Error(
      `Phase 2a attestation chain mismatch: client=${chainId} deployment=${deployments.chainId}`,
    );
  }

  const isLocal =
    deployments.network === LOCAL_HARDHAT_NETWORK &&
    deployments.chainId === LOCAL_HARDHAT_CHAIN_ID;
  const isBase =
    deployments.network === PHASE2A_BASE_NETWORK && deployments.chainId === BASE_CHAIN_ID;

  let trusted: TrustedPhase2aBaseManifest | null = null;
  if (isBase) {
    trusted =
      params.trustedBaseManifest !== undefined
        ? params.trustedBaseManifest
        : getTrustedPhase2aBaseManifest();
    if (!trusted) {
      throw new Error(
        "Phase 2a Base deployments rejected: no source-controlled trusted Base manifest",
      );
    }
    assertAddressesMatchTrustedBase(deployments, trusted);
  } else if (!isLocal) {
    throw new Error("Phase 2a attestation unsupported for this network identity");
  }

  const targets = listPhase2aAttestationTargets(deployments);
  const codeHashesByAddress: Record<string, Hex> = {};
  const addresses: Address[] = [];
  const codeHashes: Hex[] = [];

  for (const target of targets) {
    let code: Hex | undefined;
    try {
      code = await client.getBytecode({ address: target.address });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Phase 2a attestation RPC error (${target.key}): ${detail}`);
    }
    if (!isNonEmptyBytecode(code)) {
      throw new Error(`Phase 2a attestation failed: empty bytecode at ${target.key}`);
    }
    const hash = runtimeCodeHash(code!);
    const addrKey = getAddress(target.address).toLowerCase();
    codeHashesByAddress[addrKey] = hash;
    addresses.push(target.address);
    codeHashes.push(hash);

    if (isBase && trusted) {
      const expected = lookupTrustedHash(trusted.runtimeCodeHashes, target.address);
      if (!expected) {
        throw new Error(
          `Phase 2a Base attestation failed: missing trusted codehash for ${target.key}`,
        );
      }
      if (expected.toLowerCase() !== hash.toLowerCase()) {
        throw new Error(`Phase 2a Base runtime codehash mismatch for ${target.key}`);
      }
    }
  }

  const cacheKey = buildPhase2aAttestationCacheKey({
    chainId: deployments.chainId,
    addresses,
    codeHashes,
  });
  attestationSuccessCache.set(cacheKey, true);
  return { cacheKey, codeHashesByAddress };
}

/**
 * Consumers may expose approvals/deposit/exit only when deployments were set after attestation.
 * Passing null (shape-only / failed attest) keeps execution disabled.
 */
export function canExposePhase2aExecution(
  attestedDeployments: StableClubPhase2aPublicDeployments | null,
): boolean {
  return attestedDeployments != null;
}

export function requireAttestedPhase2aDeployments(
  attestedDeployments: StableClubPhase2aPublicDeployments | null,
): StableClubPhase2aPublicDeployments {
  if (!canExposePhase2aExecution(attestedDeployments)) {
    throw new Error("Phase 2a deployments are not attested — execution disabled");
  }
  return attestedDeployments!;
}
