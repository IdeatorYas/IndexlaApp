/**
 * Guarded Base mainnet deployment for INDEXLA Stable Club five-pool private beta.
 *
 * SOURCE OF TRUTH: audited fork scripts + step3 runbooks.
 * Broadcasts ONLY when:
 *   - network.name === "base"
 *   - chainId === 8453
 *   - STABLE_CLUB_BASE_DEPLOY_CONFIRMATION matches the exact phrase
 *   - DEPLOYER_PRIVATE_KEY, BASE_RPC_URL, STABLE_CLUB_GUARDIAN_ADDRESS set
 *
 * Does NOT: activate pools, deploy automation, print secrets, or publish trusted manifest.
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const {
  validatePhase2aManifest,
  earliestDiscoveryStartBlock,
} = require("./phase2a-manifest.cjs");
const guards = require("./base-mainnet-deploy-guards.cjs");

const ARTIFACT_DIR = path.join(__dirname, "../../deployments/base-mainnet");
const STATE_PATH = path.join(ARTIFACT_DIR, "stable-club-phase2a.deploy-state.json");
const ARTIFACT_PATH = path.join(ARTIFACT_DIR, "stable-club-phase2a.deploy-artifact.json");

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  ensureArtifactDir();
  const redacted = guards.redactSecretsFromObject(state);
  guards.assertArtifactHasNoSecrets(redacted);
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
}

function writeFinalArtifact(state) {
  ensureArtifactDir();
  const artifact = {
    version: state.version,
    chainId: state.chainId,
    network: state.network,
    isTestOnly: false,
    label: state.label,
    deployedAt: state.deployedAt,
    deployer: state.deployer,
    guardian: state.guardian,
    feeRecipient: state.feeRecipient,
    governanceSafe: state.governanceSafe,
    timelock: state.contracts.timelock,
    permissionRegistry: state.contracts.permissionRegistry,
    strategyRegistry: state.contracts.strategyRegistry,
    feeRouter: state.contracts.feeRouter,
    swapRouter: state.contracts.swapRouter,
    clExecutor: state.contracts.clExecutor,
    oracleGuard: state.contracts.oracleGuard,
    mevGuard: state.contracts.mevGuard,
    safetyController: state.contracts.safetyController,
    permit2: state.permit2,
    usdc: state.usdc,
    cbbtc: state.cbbtc,
    weth: state.weth,
    poolIds: state.poolIds,
    adapters: state.adapters,
    routes: state.routes,
    strategyKind: state.strategyKind,
    discoveryStartBlock: state.discoveryStartBlock,
    txHashes: state.txHashes,
    runtimeCodeHashes: state.runtimeCodeHashes,
    automation: state.automation,
    poolsActivated: false,
    activatedPoolIds: [],
    gasCeilingWei: state.gasCeilingWei,
    note: "Non-secret deploy artifact for later trusted-manifest pin. Do not invent hashes — use runtimeCodeHashes as recorded.",
  };
  guards.assertNoPoolActivation(artifact);
  guards.assertArtifactHasNoSecrets(artifact);
  fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifact;
}

async function requireLiveCode(provider, label, address) {
  const code = await provider.getCode(address);
  if (!guards.isNonEmptyBytecode(code)) {
    throw new Error(`Canonical dependency missing runtime code: ${label} @ ${address}`);
  }
  return code;
}

async function runtimeCodeHash(provider, address) {
  const code = await provider.getCode(address);
  if (!guards.isNonEmptyBytecode(code)) {
    throw new Error(`No runtime bytecode at ${address}`);
  }
  return ethers.keccak256(code);
}

async function waitReceipt(txOrResponse, label) {
  const tx = typeof txOrResponse.wait === "function" ? txOrResponse : await txOrResponse;
  const receipt = await tx.wait();
  guards.assertReceiptSuccess(receipt, label);
  return receipt;
}

async function deployNamed(name, args, state, key) {
  guards.assertContractNotForbidden(name);
  if (state.contracts[key]) {
    const liveHash = await runtimeCodeHash(ethers.provider, state.contracts[key]);
    const saved = state.runtimeCodeHashes[key];
    if (saved && saved.toLowerCase() !== liveHash.toLowerCase()) {
      throw new Error(`Resume mismatch for ${key}: code hash differs on Base`);
    }
    state.runtimeCodeHashes[key] = liveHash;
    return await ethers.getContractAt(name, state.contracts[key]);
  }

  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...(args || []));
  const deployTx = contract.deploymentTransaction();
  const receipt = await waitReceipt(deployTx, `deploy ${name}`);
  const addr = await contract.getAddress();
  const codeHash = await runtimeCodeHash(ethers.provider, addr);

  state.contracts[key] = addr;
  state.runtimeCodeHashes[key] = codeHash;
  state.txHashes.push({
    step: `deploy:${key}`,
    hash: receipt.hash,
    blockNumber: Number(receipt.blockNumber),
  });
  state.steps[`deploy_${key}`] = true;
  saveState(state);
  return contract;
}

async function sendStep(state, stepKey, label, sendFn) {
  if (state.steps[stepKey]) return;
  const tx = await sendFn();
  if (tx == null) {
    // Explicit skip (e.g. already applied on-chain during resume).
    state.steps[stepKey] = true;
    saveState(state);
    return;
  }
  const receipt = await waitReceipt(tx, label);
  state.txHashes.push({
    step: stepKey,
    hash: receipt.hash,
    blockNumber: Number(receipt.blockNumber),
  });
  state.steps[stepKey] = true;
  saveState(state);
}

async function validateCanonicalDependencies(provider) {
  for (const entry of guards.CANONICAL_CODE_ADDRESSES) {
    await requireLiveCode(provider, entry.label, entry.address);
  }
}

async function collectLiveHashesForResume(state) {
  const live = {};
  for (const [key, addr] of Object.entries(state.contracts || {})) {
    if (!addr) continue;
    live[key] = await runtimeCodeHash(ethers.provider, addr);
  }
  return live;
}

/**
 * Preflight that never broadcasts — used by tests and main().
 */
function collectBroadcastEnv(env = process.env) {
  return {
    confirmation: env.STABLE_CLUB_BASE_DEPLOY_CONFIRMATION,
    deployerKey: env.DEPLOYER_PRIVATE_KEY,
    baseRpc: env.BASE_RPC_URL,
    guardian: env.STABLE_CLUB_GUARDIAN_ADDRESS,
  };
}

function assertBroadcastAllowed(env = process.env, networkName, chainId) {
  if (networkName !== "base") {
    throw new Error(`Refusing broadcast: hardhat network must be "base", got "${networkName}"`);
  }
  guards.assertBaseChainId(chainId);
  const collected = collectBroadcastEnv(env);
  guards.assertConfirmationPhrase(collected.confirmation);
  guards.assertDeployerPrivateKeyPresent(collected.deployerKey);
  guards.assertBaseRpcConfigured(collected.baseRpc);
  const guardian = guards.assertGuardianAddress(collected.guardian);
  guards.assertAutomationDisabled({
    harvestEnabled: false,
    compoundEnabled: false,
    rebalanceEnabled: false,
  });
  return { guardian };
}

async function deployBaseMainnetStack(options = {}) {
  const networkName = options.networkName ?? network.name;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const { guardian } = assertBroadcastAllowed(
    options.env ?? process.env,
    networkName,
    chainId,
  );

  await validateCanonicalDependencies(ethers.provider);

  const [deployer] = await ethers.getSigners();
  let state = loadState();
  if (state) {
    if (Number(state.chainId) !== guards.BASE_CHAIN_ID) {
      throw new Error("Saved deploy state chainId is not Base 8453");
    }
    guards.assertResumeAddressesMatch(state, state.contracts);
    const liveHashes = await collectLiveHashesForResume(state);
    guards.assertResumeCodeHashesMatch(state, liveHashes);
    if (!guards.addrEq(state.guardian, guardian)) {
      throw new Error("Resume mismatch: guardian address differs from STABLE_CLUB_GUARDIAN_ADDRESS");
    }
  } else {
    state = guards.buildEmptyDeployState({
      deployer: deployer.address,
      guardian,
    });
    state.poolIds = guards.poolIdHashes();
    state.strategyKind = guards.strategyKind();
    saveState(state);
  }

  guards.assertNoPoolActivation(state);
  for (const name of guards.FORBIDDEN_AUTOMATION_CONTRACTS) {
    guards.assertContractNotForbidden(name);
  }

  // --- Core contracts ---
  const permissionRegistry = await deployNamed("PermissionRegistry", [], state, "permissionRegistry");
  const strategyRegistry = await deployNamed(
    "StrategyPermissionRegistry",
    [await permissionRegistry.getAddress(), guards.strategyKind(), guards.USDC],
    state,
    "strategyRegistry",
  );
  const feeRouter = await deployNamed("FeeRouter", [guards.MVP_FEE], state, "feeRouter");
  const swapRouter = await deployNamed("StableClubSwapRouter", [], state, "swapRouter");
  const oracleGuard = await deployNamed("OracleGuard", [], state, "oracleGuard");
  const mevGuard = await deployNamed("MevGuard", [], state, "mevGuard");
  const safetyController = await deployNamed("SafetyController", [], state, "safetyController");
  const clExecutor = await deployNamed(
    "StableClubConcentratedLiquidityExecutor",
    [
      await permissionRegistry.getAddress(),
      await strategyRegistry.getAddress(),
      await feeRouter.getAddress(),
      await swapRouter.getAddress(),
      await mevGuard.getAddress(),
      await oracleGuard.getAddress(),
      await safetyController.getAddress(),
      guards.USDC,
    ],
    state,
    "clExecutor",
  );
  const clAddr = await clExecutor.getAddress();

  // --- Wiring ---
  await sendStep(state, "mev_setOracle", "mevGuard.setOracle", async () =>
    mevGuard.setOracle(await oracleGuard.getAddress()),
  );
  await sendStep(state, "oracle_usdc", "oracleGuard.configureFeed USDC", async () =>
    oracleGuard.configureFeed(guards.USDC, guards.USDC_USD, 48 * 3600, 8),
  );
  await sendStep(state, "oracle_cbbtc", "oracleGuard.configureFeed cbBTC", async () =>
    oracleGuard.configureFeed(guards.CBBTC, guards.CBBTC_USD, 4 * 3600, 8),
  );
  await sendStep(state, "oracle_weth", "oracleGuard.configureFeed WETH", async () =>
    oracleGuard.configureFeed(guards.WETH, guards.WETH_USD, 4 * 3600, 8),
  );
  await sendStep(state, "oracle_peg", "oracleGuard.configurePegMonitor", async () =>
    oracleGuard.configurePegMonitor(guards.CBBTC, guards.BTC_USD, 100, 8, true),
  );

  await sendStep(state, "perm_registrar", "permissionRegistry.setStrategyRegistrar", async () =>
    permissionRegistry.setStrategyRegistrar(await strategyRegistry.getAddress(), true),
  );
  await sendStep(state, "perm_op_cl", "permissionRegistry.setOperator cl", async () =>
    permissionRegistry.setOperator(clAddr, true),
  );
  await sendStep(state, "perm_op_strat", "permissionRegistry.setOperator strategy", async () =>
    permissionRegistry.setOperator(await strategyRegistry.getAddress(), true),
  );
  await sendStep(state, "strat_op_cl", "strategyRegistry.setOperator", async () =>
    strategyRegistry.setOperator(clAddr, true),
  );
  await sendStep(state, "fee_exec", "feeRouter.setExecutorApproved", async () =>
    feeRouter.setExecutorApproved(clAddr, true),
  );
  await sendStep(state, "swap_exec", "swapRouter.setExecutorApproved", async () =>
    swapRouter.setExecutorApproved(clAddr, true),
  );
  await sendStep(state, "cl_permit2", "clExecutor.setPermit2", async () =>
    clExecutor.setPermit2(guards.BASE_PERMIT2),
  );
  await sendStep(state, "fee_permit2", "feeRouter.setPermit2", async () =>
    feeRouter.setPermit2(guards.BASE_PERMIT2),
  );
  for (const [i, token] of [guards.USDC, guards.CBBTC, guards.WETH].entries()) {
    await sendStep(state, `token_allow_${i}`, `clExecutor.setTokenApproval ${token}`, async () =>
      clExecutor.setTokenApproval(token, true),
    );
  }

  // --- Routes ---
  const routeConfigs = guards.buildRouteConfigs();
  for (const r of routeConfigs) {
    await sendStep(state, `route_${r.name}`, `swapRouter.configureRoute ${r.name}`, async () =>
      swapRouter.configureRoute(r.id, r.cfg),
    );
  }
  state.routes = routeConfigs.map((r) => ({ name: r.name, routeId: r.id, enabled: true }));
  saveState(state);

  // --- Adapters ---
  if (!Array.isArray(state.adapters) || state.adapters.length !== guards.EXPECTED_POOL_COUNT) {
    state.adapters = [];
  }
  const specs = guards.buildAdapterSpecs(clAddr);
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const key = `adapter_${i}`;
    guards.assertContractNotForbidden(
      spec.protocol === "uniswap-v3" ? "UniswapV3Adapter" : "AerodromeSlipstreamAdapter",
    );
    let adapterAddr = state.contracts[key];
    if (!adapterAddr) {
      let adapter;
      if (spec.protocol === "uniswap-v3") {
        adapter = await (
          await ethers.getContractFactory("UniswapV3Adapter")
        ).deploy(
          spec.executor,
          spec.poolId,
          spec.npm,
          spec.router,
          spec.poolAddress,
          spec.factory,
          spec.fee,
        );
      } else {
        adapter = await (
          await ethers.getContractFactory("AerodromeSlipstreamAdapter")
        ).deploy(
          spec.executor,
          spec.poolId,
          spec.npm,
          spec.router,
          spec.poolAddress,
          spec.factory,
          spec.tickSpacing,
          ethers.ZeroAddress,
        );
      }
      const receipt = await waitReceipt(adapter.deploymentTransaction(), `deploy adapter ${i}`);
      adapterAddr = await adapter.getAddress();
      state.contracts[key] = adapterAddr;
      state.runtimeCodeHashes[key] = await runtimeCodeHash(ethers.provider, adapterAddr);
      state.txHashes.push({
        step: `deploy:${key}`,
        hash: receipt.hash,
        blockNumber: Number(receipt.blockNumber),
      });
      saveState(state);
    } else {
      const liveHash = await runtimeCodeHash(ethers.provider, adapterAddr);
      const saved = state.runtimeCodeHashes[key];
      if (saved && saved.toLowerCase() !== liveHash.toLowerCase()) {
        throw new Error(`Resume mismatch for ${key}`);
      }
      state.runtimeCodeHashes[key] = liveHash;
    }

    await sendStep(state, `adapter_approve_${i}`, `setAdapterApproval ${i}`, async () =>
      clExecutor.setAdapterApproval(adapterAddr, true),
    );
    await sendStep(state, `adapter_register_${i}`, `registerPool ${i}`, async () =>
      clExecutor.registerPool(spec.poolId, adapterAddr),
    );

    state.adapters[i] = {
      poolId: spec.poolId,
      protocol: spec.protocol,
      generation: spec.generation,
      adapter: adapterAddr,
      factory: spec.factory,
      npm: spec.npm,
      router: spec.router,
      poolAddress: spec.poolAddress,
      tickSpacing: spec.tickSpacing,
      fee: spec.fee,
      tokenA: spec.tokenA,
      tokenB: spec.tokenB,
    };
    saveState(state);
  }

  // --- Safety: guardian + gas ceiling (before ownership transfer) ---
  await sendStep(state, "safety_guardian", "safetyController.setGuardian", async () =>
    safetyController.setGuardian(guardian),
  );
  await sendStep(state, "safety_gas", "safetyController.setMaxGasPriceWei", async () =>
    safetyController.setMaxGasPriceWei(guards.GAS_CEILING_WEI),
  );

  // --- Timelock ---
  const timelock = await deployNamed(
    "StableClubTimelock",
    [[guards.MVP_SAFE], [guards.MVP_SAFE], guards.MVP_SAFE],
    state,
    "timelock",
  );

  // --- Transfer ownership ---
  const ownables = [
    ["permissionRegistry", permissionRegistry],
    ["strategyRegistry", strategyRegistry],
    ["feeRouter", feeRouter],
    ["swapRouter", swapRouter],
    ["oracleGuard", oracleGuard],
    ["mevGuard", mevGuard],
    ["safetyController", safetyController],
    ["clExecutor", clExecutor],
  ];
  const timelockAddr = await timelock.getAddress();
  for (const [key, contract] of ownables) {
    await sendStep(state, `own_${key}`, `transferOwnership ${key}`, async () => {
      const current = await contract.owner();
      if (guards.addrEq(current, timelockAddr)) {
        return null;
      }
      return contract.transferOwnership(timelockAddr);
    });
    const ownerNow = await contract.owner();
    if (!guards.addrEq(ownerNow, timelockAddr)) {
      throw new Error(`Ownership transfer incomplete for ${key}: owner=${ownerNow}`);
    }
  }

  // Verify Timelock roles: Safe is proposer/executor; delay floor is 48h.
  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  if (!(await timelock.hasRole(proposerRole, guards.MVP_SAFE))) {
    throw new Error("Timelock PROPOSER_ROLE missing for Safe");
  }
  if (!(await timelock.hasRole(executorRole, guards.MVP_SAFE))) {
    throw new Error("Timelock EXECUTOR_ROLE missing for Safe");
  }
  const minDelay = await timelock.getMinDelay();
  if (minDelay < 48n * 3600n) {
    throw new Error(`Timelock minDelay below 48h: ${minDelay}`);
  }

  // Manifest-shaped validation (no activation).
  const manifest = {
    strategyRegistry: state.contracts.strategyRegistry,
    clExecutor: state.contracts.clExecutor,
    swapRouter: state.contracts.swapRouter,
    permit2: guards.BASE_PERMIT2,
    oracleGuard: state.contracts.oracleGuard,
    mevGuard: state.contracts.mevGuard,
    safetyController: state.contracts.safetyController,
    feeRouter: state.contracts.feeRouter,
    permissionRegistry: state.contracts.permissionRegistry,
    adapters: state.adapters,
    routes: state.routes,
  };
  validatePhase2aManifest(manifest, { localMocksOk: false });

  const receiptBlocks = state.txHashes
    .map((t) => t.blockNumber)
    .filter((n) => Number.isInteger(n) && n > 0);
  state.discoveryStartBlock = earliestDiscoveryStartBlock(receiptBlocks);
  state.deployedAt = new Date().toISOString();
  state.completed = true;
  state.poolsActivated = false;
  state.activatedPoolIds = [];
  guards.assertNoPoolActivation(state);
  saveState(state);

  const artifact = writeFinalArtifact(state);
  return { state, artifact, paths: { state: STATE_PATH, artifact: ARTIFACT_PATH } };
}

async function main() {
  if (network.name !== "base") {
    throw new Error(
      `Run with --network base only. Refusing network "${network.name}" (no broadcast).`,
    );
  }
  const result = await deployBaseMainnetStack();
  // Log non-secret summary only.
  console.log("Base mainnet deploy complete (pools NOT activated).");
  console.log(`artifact=${result.paths.artifact}`);
  console.log(`timelock=${result.state.contracts.timelock}`);
  console.log(`clExecutor=${result.state.contracts.clExecutor}`);
  console.log(`adapters=${result.state.adapters.length}`);
  console.log(`discoveryStartBlock=${result.state.discoveryStartBlock}`);
  console.log("automation=disabled poolsActivated=false");
}

module.exports = {
  deployBaseMainnetStack,
  assertBroadcastAllowed,
  collectBroadcastEnv,
  validateCanonicalDependencies,
  STATE_PATH,
  ARTIFACT_PATH,
  ARTIFACT_DIR,
  writeFinalArtifact,
  loadState,
  saveState,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
