/**
 * Pure guards for Base mainnet Stable Club deployment.
 * No secrets, no RPC URLs printed — safe to unit-test offline.
 */
const { ethers } = require("hardhat");
const {
  CANONICAL_INFRA,
  BASE_PERMIT2,
  EXPECTED_ROUTE_IDS,
  EXPECTED_POOL_COUNT,
  EXPECTED_ROUTE_COUNT,
} = require("./phase2a-manifest.cjs");
const {
  assertProductionBaseRpcUrl,
  assertNotLocalEthereumClient,
} = require("./base-rpc-url-guards.cjs");

const BASE_CHAIN_ID = 8453;
const ARTIFACT_VERSION = 2;
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
/** Exact TimelockController minDelay required on Base private-beta deploy. */
const TIMELOCK_MIN_DELAY_SECONDS = 48 * 60 * 60;

/**
 * Ownable contracts transferred to Timelock.
 * Adapters are NOT Ownable — they bind an immutable `executor` (verified separately).
 */
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

const ADAPTER_OWNERSHIP_NOTE =
  "Adapters (UniswapV3Adapter / AerodromeSlipstreamAdapter) are not Ownable; " +
  "ownership is enforced via immutable executor === clExecutor.";

/** Exact phrase required in STABLE_CLUB_BASE_DEPLOY_CONFIRMATION before broadcast. */
const BASE_DEPLOY_CONFIRMATION_PHRASE =
  "I AUTHORIZE INDEXLA STABLE CLUB BASE MAINNET DEPLOY";

/** Contracts forbidden for private-beta Base deploy (automation remains disabled). */
const FORBIDDEN_AUTOMATION_CONTRACTS = Object.freeze([
  "StableClubAutomationExecutor",
  "OpenServProposalGate",
  "StableClubExecutor",
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

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function computeConfigurationHash(plan) {
  return ethers.keccak256(ethers.toUtf8Bytes(stableStringify(plan)));
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

function buildConfigurationPlan(guardian) {
  return {
    artifactVersion: ARTIFACT_VERSION,
    chainId: BASE_CHAIN_ID,
    network: "base",
    strategyKind: STRATEGY_KIND_LABEL,
    permit2: BASE_PERMIT2,
    usdc: USDC,
    cbbtc: CBBTC,
    weth: WETH,
    oracles: {
      usdcUsd: USDC_USD,
      cbbtcUsd: CBBTC_USD,
      btcUsd: BTC_USD,
      wethUsd: WETH_USD,
      cbbtcPegMaxDeviationBps: 100,
    },
    gasCeilingWei: GAS_CEILING_WEI.toString(),
    governanceSafe: MVP_SAFE,
    feeRecipient: MVP_FEE,
    guardian: guardian ? ethers.getAddress(guardian) : null,
    automation: {
      harvestEnabled: false,
      compoundEnabled: false,
      rebalanceEnabled: false,
    },
    poolsActivated: false,
    forbiddenAutomationContracts: [...FORBIDDEN_AUTOMATION_CONTRACTS],
    routes: buildRouteConfigs().map((r) => ({
      name: r.name,
      routeId: r.id,
      kind: r.cfg.kind,
      router: r.cfg.router,
      factory: r.cfg.factory,
      pool: r.cfg.pool,
      tokenIn: r.cfg.tokenIn,
      tokenOut: r.cfg.tokenOut,
      feeOrTickSpacing: r.cfg.feeOrTickSpacing,
      enabled: true,
    })),
    poolAddresses: [
      POOL_USDC_CBBTC_AERO_L,
      POOL_USDC_CBBTC_UNI,
      POOL_CBBTC_WETH_AERO_C,
      POOL_CBBTC_WETH_AERO_L,
      POOL_CBBTC_WETH_UNI,
    ],
    ownableKeys: [...OWNABLE_KEYS],
  };
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
  return assertProductionBaseRpcUrl(raw);
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

/**
 * Exact Hardhat contract names CREATE'd by the Base private-beta deploy path.
 * Validate this plan — never call assertContractNotForbidden on the forbidden
 * list itself (that inverted check always threw before any CREATE).
 */
const BASE_MAINNET_PRIVATE_BETA_CONTRACT_PLAN = Object.freeze([
  "PermissionRegistry",
  "StrategyPermissionRegistry",
  "FeeRouter",
  "StableClubSwapRouter",
  "OracleGuard",
  "MevGuard",
  "SafetyController",
  "StableClubConcentratedLiquidityExecutor",
  "UniswapV3Adapter",
  "AerodromeSlipstreamAdapter",
  "StableClubTimelock",
]);

/**
 * Fail closed if the planned CREATE set includes automation contracts.
 * Approved plan names must pass; every forbidden name must be absent from the plan.
 * Per-CREATE enforcement remains in deployNamed via assertContractNotForbidden.
 */
function assertPrivateBetaDeployPlan(plannedContractNames) {
  if (!Array.isArray(plannedContractNames) || plannedContractNames.length === 0) {
    throw new Error("Private beta deploy plan is missing");
  }
  for (const name of plannedContractNames) {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("Private beta deploy plan contains an invalid contract name");
    }
    assertContractNotForbidden(name);
  }
  for (const forbidden of FORBIDDEN_AUTOMATION_CONTRACTS) {
    if (plannedContractNames.includes(forbidden)) {
      throw new Error(
        `Private beta deploy plan includes forbidden automation contract: ${forbidden}`,
      );
    }
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

/** Bounded eth_getCode retries after CREATE (transient empty responses). */
const POST_CREATE_CODE_RETRIES = Object.freeze({
  maxAttempts: 5,
  delayMs: 300,
});

/**
 * Authoritative CREATE address is always receipt.contractAddress.
 * Predicted address is diagnostic only — never deployment evidence.
 */
function assertReceiptContractAddress(receipt, label) {
  assertReceiptSuccess(receipt, label);
  const raw = receipt.contractAddress;
  if (!ethers.isAddress(raw) || raw === ethers.ZeroAddress) {
    throw new Error(`CREATE receipt missing contractAddress for ${label}`);
  }
  return ethers.getAddress(raw);
}

function selectAuthoritativeCreateAddress({ receiptAddress, predictedAddress }) {
  const authoritative = ethers.getAddress(receiptAddress);
  let predicted = null;
  let predictedMismatch = false;
  if (predictedAddress && ethers.isAddress(predictedAddress) && predictedAddress !== ethers.ZeroAddress) {
    predicted = ethers.getAddress(predictedAddress);
    predictedMismatch = !addrEq(authoritative, predicted);
  }
  return { authoritative, predicted, predictedMismatch };
}

function buildUnresolvedCreateEvidence({
  key,
  contractName,
  address,
  predictedAddress,
  deployTxHash,
  blockNumber,
  blockHash,
  creationDataHash,
  constructorArgs,
}) {
  if (!key || !contractName) {
    throw new Error("Unresolved CREATE evidence requires key and contractName");
  }
  const addr = ethers.getAddress(address);
  return {
    status: "unresolved",
    key,
    contractName,
    address: addr,
    predictedAddress:
      predictedAddress && ethers.isAddress(predictedAddress)
        ? ethers.getAddress(predictedAddress)
        : null,
    deployTxHash,
    blockNumber: Number(blockNumber),
    blockHash,
    creationDataHash,
    constructorArgs: Array.isArray(constructorArgs) ? constructorArgs : [],
    // Intentionally no runtimeCodeHash — not promoted until bytecode matches artifact.
  };
}

function assertNoUnresolvedCreateEvidence(state) {
  const pending = state?.unresolvedCreateEvidence;
  if (pending == null) return;
  if (pending.status === "unresolved") {
    throw new Error(
      `Resume blocked: unresolved CREATE evidence for ${pending.key} ` +
        `(tx=${pending.deployTxHash}, address=${pending.address}). ` +
        `Clear local state for a clean redeploy; do not adopt orphans into the official artifact.`,
    );
  }
}

function assertRuntimeBytecodeMatchesArtifact(liveCode, expectedDeployedBytecode) {
  if (!isNonEmptyBytecode(liveCode)) {
    throw new Error("No runtime bytecode at CREATE address");
  }
  if (!isNonEmptyBytecode(expectedDeployedBytecode)) {
    throw new Error("Artifact deployedBytecode missing for CREATE verification");
  }
  const liveHash = ethers.keccak256(liveCode);
  const expectedHash = ethers.keccak256(expectedDeployedBytecode);
  if (liveHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error("Runtime bytecode does not match artifact deployedBytecode");
  }
  return liveHash;
}

/**
 * Retry eth_getCode while empty. Injectable getCode/sleep for unit tests.
 * @returns {Promise<string>} non-empty bytecode
 */
async function fetchRuntimeCodeWithRetries({
  getCode,
  address,
  blockTag,
  maxAttempts = POST_CREATE_CODE_RETRIES.maxAttempts,
  delayMs = POST_CREATE_CODE_RETRIES.delayMs,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (typeof getCode !== "function") {
    throw new Error("fetchRuntimeCodeWithRetries requires getCode");
  }
  const addr = ethers.getAddress(address);
  let last = "0x";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await getCode(addr, blockTag);
    if (isNonEmptyBytecode(last)) return last;
    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }
  throw new Error(
    `No runtime bytecode at CREATE address after ${maxAttempts} attempts ` +
      `(address=${addr}, blockTag=${String(blockTag)})`,
  );
}

/** Safe diagnostic log — addresses and hashes only, never secrets/RPC URLs. */
function formatCreateAddressLog({
  key,
  receiptAddress,
  predictedAddress,
  predictedMismatch,
  deployTxHash,
  blockNumber,
}) {
  return {
    event: "stable_club_create_receipt",
    key,
    receiptAddress,
    predictedAddress: predictedAddress || null,
    predictedMismatch: !!predictedMismatch,
    deployTxHash,
    blockNumber: Number(blockNumber),
  };
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

function assertUniqueContractAddresses(contracts) {
  if (!contracts || typeof contracts !== "object") {
    throw new Error("contracts map missing");
  }
  const seen = new Map();
  for (const [key, addr] of Object.entries(contracts)) {
    if (!addr) continue;
    if (!ethers.isAddress(addr) || addr === ethers.ZeroAddress) {
      throw new Error(`Invalid contract address for ${key}`);
    }
    const lower = String(addr).toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`Duplicate contract address: ${key} and ${seen.get(lower)}`);
    }
    seen.set(lower, key);
  }
}

/**
 * Authenticate a single saved deployment against live Base evidence.
 * Does not compare state-to-itself — all checks use independent live fields.
 */
function assertDeployedContractEvidence({
  key,
  saved,
  expectedDeployer,
  expectedCreationData,
  liveTx,
  liveReceipt,
  liveBlock,
  liveCodeHash,
}) {
  if (!saved || typeof saved !== "object") {
    throw new Error(`Resume evidence missing for ${key}`);
  }
  if (!ethers.isAddress(saved.address) || saved.address === ethers.ZeroAddress) {
    throw new Error(`Resume invalid address for ${key}`);
  }
  if (!saved.deployTxHash || !/^0x[a-fA-F0-9]{64}$/.test(saved.deployTxHash)) {
    throw new Error(`Resume missing deploy tx hash for ${key}`);
  }
  if (saved.blockNumber == null || Number(saved.blockNumber) <= 0) {
    throw new Error(`Resume missing block number for ${key}`);
  }
  if (!saved.blockHash || !/^0x[a-fA-F0-9]{64}$/.test(saved.blockHash)) {
    throw new Error(`Resume missing block hash for ${key}`);
  }
  if (!saved.creationDataHash || !/^0x[a-fA-F0-9]{64}$/.test(saved.creationDataHash)) {
    throw new Error(`Resume missing creation data hash for ${key}`);
  }
  if (!saved.runtimeCodeHash || !/^0x[a-fA-F0-9]{64}$/.test(saved.runtimeCodeHash)) {
    throw new Error(`Resume missing runtime code hash for ${key}`);
  }

  if (!liveTx) throw new Error(`Resume: deployment transaction not found for ${key}`);
  if (!liveReceipt) throw new Error(`Resume: deployment receipt not found for ${key}`);
  if (!liveBlock) throw new Error(`Resume: deployment block not found for ${key}`);

  assertReceiptSuccess(liveReceipt, `resume ${key}`);

  if (!addrEq(liveTx.from, expectedDeployer)) {
    throw new Error(`Resume deployer mismatch for ${key}`);
  }
  if (!addrEq(liveReceipt.contractAddress, saved.address)) {
    throw new Error(`Resume receipt contractAddress mismatch for ${key}`);
  }
  if (Number(liveReceipt.blockNumber) !== Number(saved.blockNumber)) {
    throw new Error(`Resume block number mismatch for ${key}`);
  }
  const receiptBlockHash = liveReceipt.blockHash || liveBlock.hash;
  if (!addrEq(receiptBlockHash, saved.blockHash)) {
    throw new Error(`Resume block hash mismatch for ${key}`);
  }
  if (Number(liveBlock.number) !== Number(saved.blockNumber)) {
    throw new Error(`Resume block header number mismatch for ${key}`);
  }

  const liveCreationHash = ethers.keccak256(liveTx.data);
  if (liveCreationHash.toLowerCase() !== String(saved.creationDataHash).toLowerCase()) {
    throw new Error(`Resume creation data hash mismatch for ${key}`);
  }
  if (expectedCreationData) {
    const expectedHash = ethers.keccak256(expectedCreationData);
    if (expectedHash.toLowerCase() !== liveCreationHash.toLowerCase()) {
      throw new Error(`Resume creation calldata does not match expected ${key} constructor`);
    }
  }

  if (!liveCodeHash) {
    throw new Error(`Resume missing live runtime code hash for ${key}`);
  }
  if (String(liveCodeHash).toLowerCase() !== String(saved.runtimeCodeHash).toLowerCase()) {
    throw new Error(`Resume runtime code hash mismatch for ${key}`);
  }
}

function assertResumeIdentityBinding(saved, expected) {
  if (!saved || typeof saved !== "object") {
    throw new Error("Saved deploy artifact missing");
  }
  if (Number(saved.version) !== ARTIFACT_VERSION) {
    throw new Error(
      `Legacy or unsupported deploy artifact version ${saved.version}; refusing resume`,
    );
  }
  if (!saved.identity || typeof saved.identity !== "object") {
    throw new Error("Deploy artifact missing identity binding — refusing resume");
  }
  const id = saved.identity;
  const req = [
    "chainId",
    "releaseCommit",
    "deployer",
    "governanceSafe",
    "guardian",
    "feeRecipient",
    "configurationHash",
  ];
  for (const k of req) {
    if (id[k] == null || id[k] === "") {
      throw new Error(`Deploy artifact identity missing ${k}`);
    }
  }
  if (Number(id.chainId) !== BASE_CHAIN_ID || Number(saved.chainId) !== BASE_CHAIN_ID) {
    throw new Error("Resume identity chainId is not Base 8453");
  }
  if (String(id.releaseCommit).toLowerCase() !== String(expected.releaseCommit).toLowerCase()) {
    throw new Error("Resume identity releaseCommit mismatch");
  }
  if (!addrEq(id.deployer, expected.deployer)) {
    throw new Error("Resume identity deployer mismatch");
  }
  if (!addrEq(id.governanceSafe, expected.governanceSafe)) {
    throw new Error("Resume identity Safe mismatch");
  }
  if (!addrEq(id.guardian, expected.guardian)) {
    throw new Error("Resume identity guardian mismatch");
  }
  if (!addrEq(id.feeRecipient, expected.feeRecipient)) {
    throw new Error("Resume identity fee recipient mismatch");
  }
  if (String(id.configurationHash).toLowerCase() !== String(expected.configurationHash).toLowerCase()) {
    throw new Error("Resume identity configurationHash mismatch");
  }
}

function assertContractPlanGetters({ key, getters, expected }) {
  if (!getters || typeof getters !== "object") {
    throw new Error(`Resume getters missing for ${key}`);
  }
  for (const [field, want] of Object.entries(expected)) {
    const got = getters[field];
    if (typeof want === "boolean" || typeof want === "number") {
      if (got !== want) {
        throw new Error(`Resume plan getter mismatch for ${key}.${field}`);
      }
    } else if (typeof want === "bigint") {
      if (BigInt(got) !== want) {
        throw new Error(`Resume plan getter mismatch for ${key}.${field}`);
      }
    } else if (ethers.isAddress(String(want))) {
      if (!addrEq(got, want)) {
        throw new Error(`Resume plan getter mismatch for ${key}.${field}`);
      }
    } else if (String(got).toLowerCase() !== String(want).toLowerCase()) {
      throw new Error(`Resume plan getter mismatch for ${key}.${field}`);
    }
  }
}

function buildEmptyDeployState(meta) {
  const guardian = ethers.getAddress(meta.guardian);
  const deployer = ethers.getAddress(meta.deployer);
  const plan = buildConfigurationPlan(guardian);
  const configurationHash = computeConfigurationHash(plan);
  return {
    version: ARTIFACT_VERSION,
    chainId: BASE_CHAIN_ID,
    network: "base",
    isTestOnly: false,
    label: "INDEXLA Stable Club five-pool Base mainnet (deploy artifact)",
    identity: {
      chainId: BASE_CHAIN_ID,
      releaseCommit: meta.releaseCommit,
      deployer,
      governanceSafe: MVP_SAFE,
      guardian,
      feeRecipient: MVP_FEE,
      configurationHash,
    },
    configurationPlan: plan,
    automation: {
      harvestEnabled: false,
      compoundEnabled: false,
      rebalanceEnabled: false,
    },
    poolsActivated: false,
    activatedPoolIds: [],
    forbiddenAutomationContracts: [...FORBIDDEN_AUTOMATION_CONTRACTS],
    deployer,
    guardian,
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
    deploymentRecords: {},
    /** Fail-closed CREATE receipt evidence awaiting bytecode promotion; blocks resume when set. */
    unresolvedCreateEvidence: null,
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
  // Narrow key match: do not over-redact harmless fields like tokenA / tokenIn / poolTokens.
  const forbiddenKey =
    /^(private[_-]?key|mnemonic|seed([_-]?phrase)?|secret|rpc[_-]?url|api[_-]?key|password|authorization|bearer)$/i;
  // Do not redact bare 0x hashes — deploy tx / code hashes must persist in artifacts.
  const secretValue =
    /sk-or-v1-|Bearer\s+\S+|https?:\/\/[^\s]*:[^\s]*@/i;
  const walk = (v) => {
    if (v == null) return v;
    if (typeof v === "string") {
      if (secretValue.test(v)) return "[REDACTED]";
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (forbiddenKey.test(k)) {
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

/**
 * Sanitize error text before console logging — never leak RPC URLs or API keys.
 */
function sanitizeErrorMessage(error) {
  let msg = error instanceof Error ? error.message : String(error ?? "");
  msg = msg.replace(/https?:\/\/[^\s"'`]+/gi, "[REDACTED_URL]");
  msg = msg.replace(/wss?:\/\/[^\s"'`]+/gi, "[REDACTED_URL]");
  msg = msg.replace(/sk-or-v1-\S+/gi, "[REDACTED_KEY]");
  msg = msg.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  msg = msg.replace(/api[_-]?key\s*[:=]\s*\S+/gi, "api_key=[REDACTED]");
  msg = msg.replace(/private[_-]?key\s*[:=]\s*\S+/gi, "private_key=[REDACTED]");
  return msg;
}

function assertExactTimelockDelay(minDelaySeconds) {
  const got = BigInt(minDelaySeconds);
  const want = BigInt(TIMELOCK_MIN_DELAY_SECONDS);
  if (got !== want) {
    throw new Error(
      `Timelock minDelay must be exactly ${TIMELOCK_MIN_DELAY_SECONDS}s (48h), got ${got.toString()}`,
    );
  }
}

function assertDeployerLacksDefaultAdminRole(deployerHasAdmin) {
  if (deployerHasAdmin === true) {
    throw new Error("Deployer must not retain Timelock DEFAULT_ADMIN_ROLE");
  }
}

/**
 * Fail closed if local step flags claim completion but on-chain wiring differs.
 * Pure: callers supply already-read on-chain snapshot values.
 */
function assertOnChainWiringSnapshot(snapshot, expected) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("On-chain wiring snapshot missing");
  }
  if (!expected || typeof expected !== "object") {
    throw new Error("On-chain wiring expected config missing");
  }

  const checkAddr = (label, got, want) => {
    if (!addrEq(got, want)) {
      throw new Error(`On-chain wiring mismatch: ${label}`);
    }
  };
  const checkBool = (label, got, want) => {
    if (Boolean(got) !== Boolean(want)) {
      throw new Error(`On-chain wiring mismatch: ${label}`);
    }
  };
  const checkBig = (label, got, want) => {
    if (BigInt(got) !== BigInt(want)) {
      throw new Error(`On-chain wiring mismatch: ${label}`);
    }
  };

  checkAddr("mevGuard.oracle", snapshot.mevOracle, expected.oracleGuard);
  for (const [token, feed] of Object.entries(expected.feeds)) {
    const live = snapshot.feeds?.[token];
    if (!live) throw new Error(`On-chain wiring mismatch: missing feed ${token}`);
    checkAddr(`feed[${token}].aggregator`, live.aggregator, feed.aggregator);
    checkBig(`feed[${token}].maxStalenessSec`, live.maxStalenessSec, feed.maxStalenessSec);
    checkBool(`feed[${token}].enabled`, live.enabled, true);
  }
  {
    const peg = snapshot.pegMonitor;
    if (!peg) throw new Error("On-chain wiring mismatch: missing peg monitor");
    checkAddr("peg.referenceAggregator", peg.referenceAggregator, expected.peg.referenceAggregator);
    checkBig("peg.maxDeviationBps", peg.maxDeviationBps, expected.peg.maxDeviationBps);
    checkBool("peg.enabled", peg.enabled, true);
  }

  checkBool("perm.isOperator(cl)", snapshot.permOpCl, true);
  checkBool("perm.isOperator(strategy)", snapshot.permOpStrat, true);
  checkBool("perm.isStrategyRegistrar", snapshot.permRegistrar, true);
  checkBool("strat.isOperator(cl)", snapshot.stratOpCl, true);
  checkBool("fee.approvedExecutor(cl)", snapshot.feeExec, true);
  checkBool("swap.approvedExecutor(cl)", snapshot.swapExec, true);
  checkAddr("cl.permit2", snapshot.clPermit2, expected.permit2);
  checkAddr("fee.permit2", snapshot.feePermit2, expected.permit2);

  for (const token of expected.approvedTokens) {
    checkBool(`cl.approvedToken[${token}]`, snapshot.approvedTokens?.[token], true);
  }

  for (const route of expected.routes) {
    const live = snapshot.routes?.[route.id];
    if (!live) throw new Error(`On-chain wiring mismatch: missing route ${route.name}`);
    checkBool(`route[${route.name}].enabled`, live.enabled, true);
    checkAddr(`route[${route.name}].router`, live.router, route.router);
    checkAddr(`route[${route.name}].pool`, live.pool, route.pool);
    checkAddr(`route[${route.name}].tokenIn`, live.tokenIn, route.tokenIn);
    checkAddr(`route[${route.name}].tokenOut`, live.tokenOut, route.tokenOut);
  }

  for (const adapter of expected.adapters) {
    checkBool(
      `cl.approvedAdapter[${adapter.adapter}]`,
      snapshot.approvedAdapters?.[adapter.adapter],
      true,
    );
    checkAddr(
      `cl.poolAdapters[${adapter.poolId}]`,
      snapshot.poolAdapters?.[adapter.poolId],
      adapter.adapter,
    );
    checkAddr(`adapter.executor[${adapter.adapter}]`, snapshot.adapterExecutors?.[adapter.adapter], expected.clExecutor);
  }

  checkAddr("safety.guardian", snapshot.guardian, expected.guardian);
  checkBig("safety.maxGasPriceWei", snapshot.maxGasPriceWei, expected.gasCeilingWei);
}

/**
 * Local step flags alone are never proof of completion.
 */
function assertStepFlagNotTrustedAlone(stepFlag, onChainOk) {
  if (stepFlag === true && onChainOk !== true) {
    throw new Error(
      "Forged or stale local step flag cannot skip missing on-chain wiring",
    );
  }
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
  ARTIFACT_VERSION,
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
  TIMELOCK_MIN_DELAY_SECONDS,
  BASE_DEPLOY_CONFIRMATION_PHRASE,
  FORBIDDEN_AUTOMATION_CONTRACTS,
  BASE_MAINNET_PRIVATE_BETA_CONTRACT_PLAN,
  OWNABLE_KEYS,
  ADAPTER_OWNERSHIP_NOTE,
  CANONICAL_CODE_ADDRESSES,
  EXPECTED_POOL_COUNT,
  EXPECTED_ROUTE_COUNT,
  BASE_PERMIT2,
  CANONICAL_INFRA,
  addrEq,
  isNonEmptyBytecode,
  stableStringify,
  computeConfigurationHash,
  buildConfigurationPlan,
  assertBaseChainId,
  assertConfirmationPhrase,
  assertDeployerPrivateKeyPresent,
  assertBaseRpcConfigured,
  assertProductionBaseRpcUrl,
  assertNotLocalEthereumClient,
  assertGuardianAddress,
  assertAutomationDisabled,
  assertContractNotForbidden,
  assertPrivateBetaDeployPlan,
  assertReceiptSuccess,
  POST_CREATE_CODE_RETRIES,
  assertReceiptContractAddress,
  selectAuthoritativeCreateAddress,
  buildUnresolvedCreateEvidence,
  assertNoUnresolvedCreateEvidence,
  assertRuntimeBytecodeMatchesArtifact,
  fetchRuntimeCodeWithRetries,
  formatCreateAddressLog,
  assertNoPoolActivation,
  assertUniqueContractAddresses,
  assertDeployedContractEvidence,
  assertResumeIdentityBinding,
  assertContractPlanGetters,
  assertExactTimelockDelay,
  assertDeployerLacksDefaultAdminRole,
  assertOnChainWiringSnapshot,
  assertStepFlagNotTrustedAlone,
  buildEmptyDeployState,
  redactSecretsFromObject,
  sanitizeErrorMessage,
  assertArtifactHasNoSecrets,
  poolIdHashes,
  strategyKind,
  buildRouteConfigs,
  buildAdapterSpecs,
};
