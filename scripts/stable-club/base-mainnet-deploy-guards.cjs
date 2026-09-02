/**
 * Pure guards for Base mainnet Stable Club deployment.
 * No secrets, no RPC URLs, no private keys — safe to unit-test offline.
 */
const { ethers } = require("hardhat");
const {
  CANONICAL_INFRA,
  BASE_PERMIT2,
  EXPECTED_ROUTE_IDS,
  EXPECTED_POOL_COUNT,
  EXPECTED_ROUTE_COUNT,
} = require("./phase2a-manifest.cjs");

const BASE_CHAIN_ID = 8453;
const MVP_SAFE = "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910";
const MVP_FEE = "0x9d269f7A3d3f781740081D35F086D68a4a21442D";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const USDC_USD = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";
const CBBTC_USD = "0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D";
const BTC_USD = "0x3A932b286715abc4A86a4ACAF68A6cdD89E0d446";
const WETH_USD = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";

const POOL_USDC_CBBTC_UNI = "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef";
const POOL_USDC_CBBTC_AERO_L = "0x4e962bb3889bf030368f56810a9c96b83cb3e778";
const POOL_USDC_WETH_UNI = "0xd0b53D9277642d899DF5C87A3966A349A798F224";
const POOL_USDC_WETH_AERO_L = "0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59";
const POOL_CBBTC_WETH_AERO_C = "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b";
const POOL_CBBTC_WETH_AERO_L = "0x70acdf2ad0bf2402c957154f944c19ef4e1cbae1";
const POOL_CBBTC_WETH_UNI = "0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1";

const GAS_CEILING_WEI = 1_000_000_000n;
const STRATEGY_KIND_LABEL = "STABLE_CLUB_FIVE_POOL_V1";

/** Exact phrase required in STABLE_CLUB_BASE_DEPLOY_CONFIRMATION before broadcast. */
const BASE_DEPLOY_CONFIRMATION_PHRASE =
  "I AUTHORIZE INDEXLA STABLE CLUB BASE MAINNET DEPLOY";

/** Contracts forbidden for private-beta Base deploy (automation remains disabled). */
const FORBIDDEN_AUTOMATION_CONTRACTS = Object.freeze([
  "StableClubAutomationExecutor",
  "OpenServProposalGate",
  "StableClubExecutor",
]);

const OWNABLE_KEYS = Object.freeze([
  "permissionRegistry",
  "strategyRegistry",
  "feeRouter",
  "swapRouter",
  "oracleGuard",
  "mevGuard",
  "safetyController",
  "clExecutor",
]);

const CANONICAL_CODE_ADDRESSES = Object.freeze([
  { label: "Permit2", address: BASE_PERMIT2 },
  { label: "USDC", address: USDC },
  { label: "cbBTC", address: CBBTC },
  { label: "WETH", address: WETH },
  { label: "USDC/USD feed", address: USDC_USD },
  { label: "cbBTC/USD feed", address: CBBTC_USD },
  { label: "BTC/USD feed", address: BTC_USD },
  { label: "ETH/USD feed", address: WETH_USD },
  { label: "UniV3 factory", address: CANONICAL_INFRA["uniswap-v3"].factory },
  { label: "UniV3 NPM", address: CANONICAL_INFRA["uniswap-v3"].npm },
  { label: "UniV3 router", address: CANONICAL_INFRA["uniswap-v3"].router },
  { label: "Aero legacy factory", address: CANONICAL_INFRA["aerodrome-legacy"].factory },
  { label: "Aero legacy NPM", address: CANONICAL_INFRA["aerodrome-legacy"].npm },
  { label: "Aero legacy router", address: CANONICAL_INFRA["aerodrome-legacy"].router },
  { label: "Aero current factory", address: CANONICAL_INFRA["aerodrome-current"].factory },
  { label: "Aero current NPM", address: CANONICAL_INFRA["aerodrome-current"].npm },
  { label: "Aero current router", address: CANONICAL_INFRA["aerodrome-current"].router },
  { label: "pool USDC-cbBTC Uni", address: POOL_USDC_CBBTC_UNI },
  { label: "pool USDC-cbBTC AeroL", address: POOL_USDC_CBBTC_AERO_L },
  { label: "pool USDC-WETH Uni", address: POOL_USDC_WETH_UNI },
  { label: "pool USDC-WETH AeroL", address: POOL_USDC_WETH_AERO_L },
  { label: "pool cbBTC-WETH AeroC", address: POOL_CBBTC_WETH_AERO_C },
  { label: "pool cbBTC-WETH AeroL", address: POOL_CBBTC_WETH_AERO_L },
  { label: "pool cbBTC-WETH Uni", address: POOL_CBBTC_WETH_UNI },
  { label: "MVP Safe", address: MVP_SAFE },
]);

function addrEq(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function isNonEmptyBytecode(code) {
  if (code == null) return false;
  const s = String(code);
  return s !== "0x" && s !== "0x0" && s.length > 2;
}

function assertBaseChainId(chainId) {
  const n = Number(chainId);
  if (n !== BASE_CHAIN_ID) {
    throw new Error(`Base deploy requires chainId ${BASE_CHAIN_ID}, got ${n}`);
  }
}

function assertConfirmationPhrase(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value !== BASE_DEPLOY_CONFIRMATION_PHRASE) {
    throw new Error(
      "Missing or incorrect STABLE_CLUB_BASE_DEPLOY_CONFIRMATION — refusing Base broadcast",
    );
  }
}

function assertDeployerPrivateKeyPresent(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error("DEPLOYER_PRIVATE_KEY required for Base mainnet broadcast");
  }
  if (!value.startsWith("0x") || value.length < 66) {
    throw new Error("DEPLOYER_PRIVATE_KEY format invalid");
  }
  return value;
}

function assertBaseRpcConfigured(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error("BASE_RPC_URL required for Base mainnet broadcast");
  }
  return value;
}

function assertGuardianAddress(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) {
    throw new Error("STABLE_CLUB_GUARDIAN_ADDRESS must be a non-zero address");
  }
  const checksummed = ethers.getAddress(value);
  if (addrEq(checksummed, MVP_SAFE)) {
    throw new Error("Guardian must not be the governance Safe");
  }
  if (addrEq(checksummed, MVP_FEE)) {
    throw new Error("Guardian must not be the fee recipient");
  }
  return checksummed;
}

function assertAutomationDisabled(params) {
  if (!params || typeof params !== "object") {
    throw new Error("Launch automation params missing");
  }
  if (
    params.harvestEnabled === true ||
    params.compoundEnabled === true ||
    params.rebalanceEnabled === true
  ) {
    throw new Error("Private beta requires harvest/compound/rebalance disabled");
  }
}

function assertContractNotForbidden(contractName) {
  if (FORBIDDEN_AUTOMATION_CONTRACTS.includes(contractName)) {
    throw new Error(
      `Refusing to deploy automation contract in private beta: ${contractName}`,
    );
  }
}

function assertReceiptSuccess(receipt, label) {
  if (receipt == null) {
    throw new Error(`Missing receipt for ${label}`);
  }
  const status = receipt.status;
  if (status !== 1 && status !== 1n && status !== true) {
    throw new Error(`Failed receipt for ${label}: status=${String(status)}`);
  }
  if (receipt.blockNumber == null || Number(receipt.blockNumber) <= 0) {
    throw new Error(`Invalid receipt block for ${label}`);
  }
}

function assertNoPoolActivation(state) {
  if (!state || typeof state !== "object") {
    throw new Error("Deploy state missing for pool-activation check");
  }
  if (state.poolsActivated === true) {
    throw new Error("Pool activation is forbidden in Base deploy script");
  }
  if (Array.isArray(state.activatedPoolIds) && state.activatedPoolIds.length > 0) {
    throw new Error("activatedPoolIds must remain empty after Base deploy");
  }
  if (state.steps && state.steps.activatePools) {
    throw new Error("activatePools step is forbidden");
  }
}

function assertResumeCodeHashesMatch(saved, liveHashes) {
  if (!saved?.runtimeCodeHashes || typeof saved.runtimeCodeHashes !== "object") {
    throw new Error("Saved deploy state missing runtimeCodeHashes");
  }
  if (!liveHashes || typeof liveHashes !== "object") {
    throw new Error("Live runtimeCodeHashes missing");
  }
  const savedKeys = Object.keys(saved.runtimeCodeHashes).sort();
  const liveKeys = Object.keys(liveHashes).sort();
  for (const key of savedKeys) {
    const expected = String(saved.runtimeCodeHashes[key]).toLowerCase();
    const actual = liveHashes[key] != null ? String(liveHashes[key]).toLowerCase() : "";
    if (!actual) {
      throw new Error(`Resume mismatch: missing live code hash for ${key}`);
    }
    if (expected !== actual) {
      throw new Error(`Resume mismatch: runtime code hash differs for ${key}`);
    }
  }
  // If live has fewer completed keys than saved, fail closed.
  for (const key of savedKeys) {
    if (!liveKeys.includes(key)) {
      throw new Error(`Resume mismatch: live set missing ${key}`);
    }
  }
}

function assertResumeAddressesMatch(saved, liveAddresses) {
  if (!saved?.contracts || typeof saved.contracts !== "object") {
    throw new Error("Saved deploy state missing contracts");
  }
  for (const [key, addr] of Object.entries(saved.contracts)) {
    if (!addr) continue;
    const live = liveAddresses?.[key];
    if (!live || !addrEq(live, addr)) {
      throw new Error(`Resume mismatch: address for ${key} does not match Base`);
    }
  }
}

function buildEmptyDeployState(meta) {
  return {
    version: 1,
    chainId: BASE_CHAIN_ID,
    network: "base",
    isTestOnly: false,
    label: "INDEXLA Stable Club five-pool Base mainnet (deploy artifact)",
    automation: {
      harvestEnabled: false,
      compoundEnabled: false,
      rebalanceEnabled: false,
    },
    poolsActivated: false,
    activatedPoolIds: [],
    forbiddenAutomationContracts: [...FORBIDDEN_AUTOMATION_CONTRACTS],
    deployer: meta.deployer,
    guardian: meta.guardian,
    feeRecipient: MVP_FEE,
    governanceSafe: MVP_SAFE,
    permit2: BASE_PERMIT2,
    usdc: USDC,
    cbbtc: CBBTC,
    weth: WETH,
    gasCeilingWei: GAS_CEILING_WEI.toString(),
    confirmationPhraseRequired: BASE_DEPLOY_CONFIRMATION_PHRASE,
    steps: {},
    contracts: {},
    adapters: [],
    routes: [],
    txHashes: [],
    runtimeCodeHashes: {},
    discoveryStartBlock: null,
    deployedAt: null,
    completed: false,
  };
}

function redactSecretsFromObject(obj) {
  const forbidden =
    /private[_-]?key|mnemonic|seed|secret|rpc[_-]?url|api[_-]?key|password|token/i;
  const walk = (v) => {
    if (v == null) return v;
    if (typeof v === "string") {
      if (forbidden.test(v)) return "[REDACTED]";
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (forbidden.test(k)) {
          out[k] = "[REDACTED]";
        } else {
          out[k] = walk(val);
        }
      }
      return out;
    }
    return v;
  };
  return walk(obj);
}

function assertArtifactHasNoSecrets(artifact) {
  const json = JSON.stringify(artifact);
  if (/BASE_RPC_URL|DEPLOYER_PRIVATE_KEY|PRIVATE_KEY|mnemonic|seed[_-]?phrase/i.test(json)) {
    throw new Error("Artifact appears to contain secret field names or material");
  }
  if (/https?:\/\//i.test(json)) {
    throw new Error("Artifact must not contain URLs/RPC endpoints");
  }
}

function poolIdHashes() {
  return [
    ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
    ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005"),
    ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL10"),
    ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100"),
    ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_UNI_005"),
  ];
}

function strategyKind() {
  return ethers.id(STRATEGY_KIND_LABEL);
}

function buildRouteConfigs() {
  const uni = CANONICAL_INFRA["uniswap-v3"];
  const aeroL = CANONICAL_INFRA["aerodrome-legacy"];
  const routeIds = EXPECTED_ROUTE_IDS;
  return [
    {
      name: "USDC_CBBTC_AERO_L",
      id: routeIds.USDC_CBBTC_AERO_L,
      cfg: {
        kind: 1,
        router: aeroL.router,
        factory: aeroL.factory,
        pool: POOL_USDC_CBBTC_AERO_L,
        tokenIn: USDC,
        tokenOut: CBBTC,
        feeOrTickSpacing: 100,
        enabled: true,
      },
    },
    {
      name: "USDC_CBBTC_UNI",
      id: routeIds.USDC_CBBTC_UNI,
      cfg: {
        kind: 0,
        router: uni.router,
        factory: uni.factory,
        pool: POOL_USDC_CBBTC_UNI,
        tokenIn: USDC,
        tokenOut: CBBTC,
        feeOrTickSpacing: 500,
        enabled: true,
      },
    },
    {
      name: "USDC_WETH_UNI",
      id: routeIds.USDC_WETH_UNI,
      cfg: {
        kind: 0,
        router: uni.router,
        factory: uni.factory,
        pool: POOL_USDC_WETH_UNI,
        tokenIn: USDC,
        tokenOut: WETH,
        feeOrTickSpacing: 500,
        enabled: true,
      },
    },
    {
      name: "USDC_WETH_AERO_L",
      id: routeIds.USDC_WETH_AERO_L,
      cfg: {
        kind: 1,
        router: aeroL.router,
        factory: aeroL.factory,
        pool: POOL_USDC_WETH_AERO_L,
        tokenIn: USDC,
        tokenOut: WETH,
        feeOrTickSpacing: 100,
        enabled: true,
      },
    },
  ];
}

function buildAdapterSpecs(clExecutorAddr) {
  const uni = CANONICAL_INFRA["uniswap-v3"];
  const aeroL = CANONICAL_INFRA["aerodrome-legacy"];
  const aeroC = CANONICAL_INFRA["aerodrome-current"];
  const poolIds = poolIdHashes();
  return [
    {
      poolId: poolIds[0],
      protocol: "aerodrome-slipstream",
      generation: "aerodrome-legacy",
      npm: aeroL.npm,
      router: aeroL.router,
      poolAddress: POOL_USDC_CBBTC_AERO_L,
      factory: aeroL.factory,
      tickSpacing: 100,
      tokenA: USDC,
      tokenB: CBBTC,
      executor: clExecutorAddr,
    },
    {
      poolId: poolIds[1],
      protocol: "uniswap-v3",
      generation: "uniswap-v3",
      npm: uni.npm,
      router: uni.router,
      poolAddress: POOL_USDC_CBBTC_UNI,
      factory: uni.factory,
      fee: 500,
      tokenA: USDC,
      tokenB: CBBTC,
      executor: clExecutorAddr,
    },
    {
      poolId: poolIds[2],
      protocol: "aerodrome-slipstream",
      generation: "aerodrome-current",
      npm: aeroC.npm,
      router: aeroC.router,
      poolAddress: POOL_CBBTC_WETH_AERO_C,
      factory: aeroC.factory,
      tickSpacing: 10,
      tokenA: CBBTC,
      tokenB: WETH,
      executor: clExecutorAddr,
    },
    {
      poolId: poolIds[3],
      protocol: "aerodrome-slipstream",
      generation: "aerodrome-legacy",
      npm: aeroL.npm,
      router: aeroL.router,
      poolAddress: POOL_CBBTC_WETH_AERO_L,
      factory: aeroL.factory,
      tickSpacing: 100,
      tokenA: CBBTC,
      tokenB: WETH,
      executor: clExecutorAddr,
    },
    {
      poolId: poolIds[4],
      protocol: "uniswap-v3",
      generation: "uniswap-v3",
      npm: uni.npm,
      router: uni.router,
      poolAddress: POOL_CBBTC_WETH_UNI,
      factory: uni.factory,
      fee: 500,
      tokenA: CBBTC,
      tokenB: WETH,
      executor: clExecutorAddr,
    },
  ];
}

module.exports = {
  BASE_CHAIN_ID,
  MVP_SAFE,
  MVP_FEE,
  USDC,
  CBBTC,
  WETH,
  USDC_USD,
  CBBTC_USD,
  BTC_USD,
  WETH_USD,
  GAS_CEILING_WEI,
  BASE_DEPLOY_CONFIRMATION_PHRASE,
  FORBIDDEN_AUTOMATION_CONTRACTS,
  OWNABLE_KEYS,
  CANONICAL_CODE_ADDRESSES,
  EXPECTED_POOL_COUNT,
  EXPECTED_ROUTE_COUNT,
  BASE_PERMIT2,
  CANONICAL_INFRA,
  addrEq,
  isNonEmptyBytecode,
  assertBaseChainId,
  assertConfirmationPhrase,
  assertDeployerPrivateKeyPresent,
  assertBaseRpcConfigured,
  assertGuardianAddress,
  assertAutomationDisabled,
  assertContractNotForbidden,
  assertReceiptSuccess,
  assertNoPoolActivation,
  assertResumeCodeHashesMatch,
  assertResumeAddressesMatch,
  buildEmptyDeployState,
  redactSecretsFromObject,
  assertArtifactHasNoSecrets,
  poolIdHashes,
  strategyKind,
  buildRouteConfigs,
  buildAdapterSpecs,
};
