/**
 * Guarded Base mainnet deployment for INDEXLA Stable Club five-pool private beta.
 *
 * SOURCE OF TRUTH: audited fork scripts + step3 runbooks.
 * Broadcasts ONLY when:
 *   - network.name === "base"
 *   - chainId === 8453
 *   - STABLE_CLUB_BASE_DEPLOY_CONFIRMATION matches the exact phrase
 *   - DEPLOYER_PRIVATE_KEY, BASE_RPC_URL, STABLE_CLUB_GUARDIAN_ADDRESS set
 *   - RPC is HTTPS non-local and not Hardhat/Anvil
 *
 * Does NOT: activate pools, deploy automation, print secrets/RPC URLs, or publish trusted manifest.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { ethers, network, artifacts } = require("hardhat");
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

function atomicWriteJson(filePath, value) {
  ensureArtifactDir();
  const redacted = guards.redactSecretsFromObject(value);
  guards.assertArtifactHasNoSecrets(redacted);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  atomicWriteJson(STATE_PATH, state);
}

function writeFinalArtifact(state) {
  const artifact = {
    version: state.version,
    chainId: state.chainId,
    network: state.network,
    isTestOnly: false,
    label: state.label,
    identity: state.identity,
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
    deploymentRecords: state.deploymentRecords,
    automation: state.automation,
    poolsActivated: false,
    activatedPoolIds: [],
    gasCeilingWei: state.gasCeilingWei,
    note: "Non-secret deploy artifact for later trusted-manifest pin. Do not invent hashes — use runtimeCodeHashes as recorded.",
  };
  guards.assertNoPoolActivation(artifact);
  atomicWriteJson(ARTIFACT_PATH, artifact);
  return artifact;
}

function resolveReleaseCommit(env = process.env) {
  const fromEnv = env.STABLE_CLUB_DEPLOY_RELEASE_COMMIT?.trim();
  if (fromEnv && /^[0-9a-fA-F]{40}$/.test(fromEnv)) return fromEnv.toLowerCase();
  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: path.join(__dirname, "../.."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^[0-9a-fA-F]{40}$/.test(sha)) return sha.toLowerCase();
  } catch {
    // fall through
  }
  throw new Error(
    "STABLE_CLUB_DEPLOY_RELEASE_COMMIT (40-hex) required when git HEAD is unavailable",
  );
}

async function requireLiveCode(provider, label, address) {
  const code = await provider.getCode(address);
  if (!guards.isNonEmptyBytecode(code)) {
    throw new Error(`Canonical dependency missing runtime code: ${label}`);
  }
  return code;
}

async function runtimeCodeHash(provider, address, blockTag) {
  const code = await provider.getCode(address, blockTag);
  if (!guards.isNonEmptyBytecode(code)) {
    throw new Error("No runtime bytecode at saved contract address");
  }
  return ethers.keccak256(code);
}

async function waitReceipt(txOrResponse, label) {
  const tx = typeof txOrResponse.wait === "function" ? txOrResponse : await txOrResponse;
  const receipt = await tx.wait();
  guards.assertReceiptSuccess(receipt, label);
  return receipt;
}

function safePredictedCreateAddress(deploymentTx) {
  try {
    if (!deploymentTx?.from || deploymentTx.nonce == null) return null;
    return ethers.getCreateAddress({
      from: deploymentTx.from,
      nonce: deploymentTx.nonce,
    });
  } catch {
    return null;
  }
}

/**
 * After a successful CREATE receipt:
 * 1) persist unresolved recovery evidence (fail-closed)
 * 2) verify runtime bytecode at receipt.blockNumber with bounded retries
 * 3) promote to deploymentRecords only after artifact match
 * Never uses contract.getAddress() as evidence.
 *
 * @param {object} [deps] optional test seams (provider/saveState/waitReceipt/sleep)
 */
async function finalizeCreateFromReceipt(
  state,
  {
    key,
    contractName,
    constructorArgs,
    expectedCreationData,
    expectedDeployedBytecode,
    deploymentTx,
  },
  deps = {},
) {
  guards.assertNoUnresolvedCreateEvidence(state);

  const provider = deps.provider || ethers.provider;
  const save = deps.saveState || saveState;
  const wait = deps.waitReceipt || waitReceipt;
  const sleep = deps.sleep;

  const predictedAddress = safePredictedCreateAddress(deploymentTx);
  const receipt = await wait(deploymentTx, `deploy ${contractName}`);
  const receiptAddress = guards.assertReceiptContractAddress(receipt, key);
  const { authoritative, predicted, predictedMismatch } =
    guards.selectAuthoritativeCreateAddress({
      receiptAddress,
      predictedAddress,
    });

  console.log(
    JSON.stringify(
      guards.formatCreateAddressLog({
        key,
        receiptAddress: authoritative,
        predictedAddress: predicted,
        predictedMismatch,
        deployTxHash: receipt.hash,
        blockNumber: Number(receipt.blockNumber),
      }),
    ),
  );

  const block = await provider.getBlock(receipt.blockNumber);
  if (!block) {
    throw new Error(`Missing block for CREATE ${key}`);
  }
  const fullTx = await provider.getTransaction(receipt.hash);
  if (!fullTx) {
    throw new Error(`Missing transaction for CREATE ${key}`);
  }

  state.unresolvedCreateEvidence = guards.buildUnresolvedCreateEvidence({
    key,
    contractName,
    address: authoritative,
    predictedAddress: predicted,
    deployTxHash: receipt.hash,
    blockNumber: Number(receipt.blockNumber),
    blockHash: receipt.blockHash || block.hash,
    creationDataHash: ethers.keccak256(fullTx.data),
    constructorArgs: constructorArgs || [],
  });
  save(state);

  try {
    const liveCode = await guards.fetchRuntimeCodeWithRetries({
      getCode: (addr, tag) => provider.getCode(addr, tag),
      address: authoritative,
      blockTag: Number(receipt.blockNumber),
      ...(sleep ? { sleep } : {}),
      ...(deps.codeRetries || {}),
    });
    const codeHash = guards.assertRuntimeBytecodeMatchesArtifact(
      liveCode,
      expectedDeployedBytecode,
    );

    guards.assertDeployedContractEvidence({
      key,
      saved: {
        address: authoritative,
        deployTxHash: receipt.hash,
        blockNumber: Number(receipt.blockNumber),
        blockHash: receipt.blockHash || block.hash,
        creationDataHash: ethers.keccak256(fullTx.data),
        runtimeCodeHash: codeHash,
      },
      expectedDeployer: state.deployer,
      expectedCreationData,
      liveTx: fullTx,
      liveReceipt: receipt,
      liveBlock: block,
      liveCodeHash: codeHash,
    });

    recordDeployment(state, key, {
      address: authoritative,
      deployTx: fullTx,
      receipt,
      block,
      runtimeHash: codeHash,
      contractName,
      constructorArgs: constructorArgs || [],
    });
    state.unresolvedCreateEvidence = null;
    save(state);
    return authoritative;
  } catch (error) {
    // Leave unresolvedCreateEvidence persisted for fail-closed recovery / resume block.
    throw error;
  }
}

async function assertBaseRpcClientNotLocal(provider) {
  let version;
  try {
    version = await provider.send("web3_clientVersion", []);
  } catch {
    throw new Error("Unable to read Ethereum client version from Base RPC");
  }
  guards.assertNotLocalEthereumClient(version);
}

async function authenticateSavedContract(provider, state, key, expectedCreationData) {
  const saved = state.deploymentRecords?.[key];
  if (!saved) {
    throw new Error(`Resume missing deployment record for ${key} — refusing to continue`);
  }
  const liveTx = await provider.getTransaction(saved.deployTxHash);
  const liveReceipt = await provider.getTransactionReceipt(saved.deployTxHash);
  const liveBlock = await provider.getBlock(saved.blockNumber);
  const liveCodeHash = await runtimeCodeHash(provider, saved.address, saved.blockNumber);

  guards.assertDeployedContractEvidence({
    key,
    saved,
    expectedDeployer: state.deployer,
    expectedCreationData,
    liveTx,
    liveReceipt,
    liveBlock,
    liveCodeHash,
  });

  // Keep maps consistent with authenticated record (from live evidence, not self-compare).
  state.contracts[key] = ethers.getAddress(saved.address);
  state.runtimeCodeHashes[key] = liveCodeHash;
}

async function authenticateResumeState(provider, state, expectedIdentity) {
  guards.assertNoUnresolvedCreateEvidence(state);
  guards.assertResumeIdentityBinding(state, expectedIdentity);
  guards.assertAutomationDisabled(state.automation);
  guards.assertNoPoolActivation(state);
  guards.assertUniqueContractAddresses(state.contracts);

  const keys = Object.keys(state.deploymentRecords || {});
  if (keys.length === 0 && Object.keys(state.contracts || {}).length > 0) {
    throw new Error("Incomplete deploy artifact: contracts without deploymentRecords");
  }

  // Immediate constructor/deployment-data verification (not deferred to deployNamed).
  for (const key of keys) {
    const saved = state.deploymentRecords[key];
    if (!saved?.contractName) {
      throw new Error(`Resume record for ${key} missing contractName`);
    }
    const factory = await ethers.getContractFactory(saved.contractName);
    const ctorArgs = Array.isArray(saved.constructorArgs) ? saved.constructorArgs : [];
    const expectedCreationData = (await factory.getDeployTransaction(...ctorArgs)).data;
    await authenticateSavedContract(provider, state, key, expectedCreationData);
  }

  for (const key of Object.keys(state.contracts || {})) {
    if (!state.deploymentRecords?.[key]) {
      throw new Error(`Tampered artifact: contract ${key} missing deployment record`);
    }
  }
}

function recordDeployment(state, key, { address, deployTx, receipt, block, runtimeHash, contractName, constructorArgs }) {
  const creationDataHash = ethers.keccak256(deployTx.data);
  state.contracts[key] = ethers.getAddress(address);
  state.runtimeCodeHashes[key] = runtimeHash;
  state.deploymentRecords[key] = {
    key,
    contractName,
    address: ethers.getAddress(address),
    deployTxHash: receipt.hash,
    blockNumber: Number(receipt.blockNumber),
    blockHash: receipt.blockHash || block.hash,
    creationDataHash,
    runtimeCodeHash: runtimeHash,
    constructorArgs: constructorArgs ?? [],
  };
  state.txHashes.push({
    step: `deploy:${key}`,
    hash: receipt.hash,
    blockNumber: Number(receipt.blockNumber),
  });
  state.steps[`deploy_${key}`] = true;
}

async function deployNamed(name, args, state, key) {
  guards.assertContractNotForbidden(name);
  guards.assertNoUnresolvedCreateEvidence(state);
  const factory = await ethers.getContractFactory(name);
  const artifact = await artifacts.readArtifact(name);
  const deployTxRequest = await factory.getDeployTransaction(...(args || []));
  const expectedCreationData = deployTxRequest.data;

  if (state.contracts[key] || state.deploymentRecords?.[key]) {
    await authenticateSavedContract(ethers.provider, state, key, expectedCreationData);
    return await ethers.getContractAt(name, state.contracts[key]);
  }

  const pending = await factory.deploy(...(args || []));
  const deploymentTx = pending.deploymentTransaction();
  const addr = await finalizeCreateFromReceipt(state, {
    key,
    contractName: name,
    constructorArgs: args || [],
    expectedCreationData,
    expectedDeployedBytecode: artifact.deployedBytecode,
    deploymentTx,
  });
  return await ethers.getContractAt(name, addr);
}

/**
 * Never trust state.steps[*] alone. When a step flag is set, verifyFn must prove on-chain state.
 * Optionally re-validate a recorded receipt hash.
 */
async function sendStep(state, stepKey, label, sendFn, verifyFn) {
  if (typeof verifyFn !== "function") {
    throw new Error(`Wiring step ${stepKey} requires an on-chain verifier`);
  }

  if (state.steps[stepKey]) {
    try {
      await verifyFn();
    } catch (error) {
      const detail = guards.sanitizeErrorMessage(error);
      throw new Error(
        `Forged or stale local step flag cannot skip missing on-chain wiring (${stepKey}): ${detail}`,
      );
    }
    const recorded = (state.txHashes || []).find((t) => t.step === stepKey);
    if (recorded?.hash) {
      const liveReceipt = await ethers.provider.getTransactionReceipt(recorded.hash);
      guards.assertReceiptSuccess(liveReceipt, `resume receipt ${stepKey}`);
    }
    return;
  }

  const tx = await sendFn();
  if (tx == null) {
    await verifyFn();
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
  await verifyFn();
  state.steps[stepKey] = true;
  saveState(state);
}

async function validateCanonicalDependencies(provider) {
  for (const entry of guards.CANONICAL_CODE_ADDRESSES) {
    await requireLiveCode(provider, entry.label, entry.address);
  }
}

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
  guards.assertProductionBaseRpcUrl(collected.baseRpc);
  const guardian = guards.assertGuardianAddress(collected.guardian);
  guards.assertAutomationDisabled({
    harvestEnabled: false,
    compoundEnabled: false,
    rebalanceEnabled: false,
  });
  return { guardian };
}

async function readFeedTuple(oracleGuard, token) {
  const feed = await oracleGuard.feeds(token);
  return {
    aggregator: feed.aggregator ?? feed[0],
    maxStalenessSec: feed.maxStalenessSec ?? feed[1],
    decimals: feed.decimals ?? feed[2],
    enabled: feed.enabled ?? feed[3],
  };
}

async function readPegTuple(oracleGuard, token) {
  const peg = await oracleGuard.pegMonitors(token);
  return {
    referenceAggregator: peg.referenceAggregator ?? peg[0],
    maxDeviationBps: peg.maxDeviationBps ?? peg[1],
    decimals: peg.decimals ?? peg[2],
    enabled: peg.enabled ?? peg[3],
  };
}

async function readRouteTuple(swapRouter, routeId) {
  const route = await swapRouter.getRoute(routeId);
  return {
    kind: route.kind,
    router: route.router,
    factory: route.factory,
    pool: route.pool,
    tokenIn: route.tokenIn,
    tokenOut: route.tokenOut,
    feeOrTickSpacing: route.feeOrTickSpacing,
    enabled: route.enabled,
  };
}

/**
 * Aggregate on-chain wiring check. Must pass before any ownership transfer to Timelock.
 */
async function verifyAggregateOnChainWiring(state, ctx) {
  const {
    permissionRegistry,
    strategyRegistry,
    feeRouter,
    swapRouter,
    oracleGuard,
    mevGuard,
    safetyController,
    clExecutor,
    clAddr,
    guardian,
  } = ctx;

  const routeConfigs = guards.buildRouteConfigs();
  const adapters = Array.isArray(state.adapters) ? state.adapters : [];
  if (adapters.length !== guards.EXPECTED_POOL_COUNT) {
    throw new Error("Adapter map incomplete before Timelock ownership transfer");
  }

  const feeds = {
    [guards.USDC]: await readFeedTuple(oracleGuard, guards.USDC),
    [guards.CBBTC]: await readFeedTuple(oracleGuard, guards.CBBTC),
    [guards.WETH]: await readFeedTuple(oracleGuard, guards.WETH),
  };
  const pegMonitor = await readPegTuple(oracleGuard, guards.CBBTC);

  const approvedTokens = {};
  for (const token of [guards.USDC, guards.CBBTC, guards.WETH]) {
    approvedTokens[token] = await clExecutor.approvedTokens(token);
  }

  const routes = {};
  for (const r of routeConfigs) {
    routes[r.id] = await readRouteTuple(swapRouter, r.id);
  }

  const approvedAdapters = {};
  const poolAdapters = {};
  const adapterExecutors = {};
  for (const entry of adapters) {
    approvedAdapters[entry.adapter] = await clExecutor.approvedAdapters(entry.adapter);
    poolAdapters[entry.poolId] = await clExecutor.poolAdapters(entry.poolId);
    const adapter = await ethers.getContractAt(
      entry.protocol === "uniswap-v3" ? "UniswapV3Adapter" : "AerodromeSlipstreamAdapter",
      entry.adapter,
    );
    adapterExecutors[entry.adapter] = await adapter.executor();
  }

  const snapshot = {
    mevOracle: await mevGuard.oracle(),
    feeds,
    pegMonitor,
    permOpCl: await permissionRegistry.isOperator(clAddr),
    permOpStrat: await permissionRegistry.isOperator(await strategyRegistry.getAddress()),
    permRegistrar: await permissionRegistry.isStrategyRegistrar(await strategyRegistry.getAddress()),
    stratOpCl: await strategyRegistry.isOperator(clAddr),
    feeExec: await feeRouter.approvedExecutors(clAddr),
    swapExec: await swapRouter.approvedExecutors(clAddr),
    clPermit2: await clExecutor.permit2(),
    feePermit2: await feeRouter.permit2(),
    approvedTokens,
    routes,
    approvedAdapters,
    poolAdapters,
    adapterExecutors,
    guardian: await safetyController.guardian(),
    maxGasPriceWei: await safetyController.maxGasPriceWei(),
  };

  guards.assertOnChainWiringSnapshot(snapshot, {
    oracleGuard: await oracleGuard.getAddress(),
    permit2: guards.BASE_PERMIT2,
    clExecutor: clAddr,
    guardian,
    gasCeilingWei: guards.GAS_CEILING_WEI,
    feeds: {
      [guards.USDC]: { aggregator: guards.USDC_USD, maxStalenessSec: 48 * 3600 },
      [guards.CBBTC]: { aggregator: guards.CBBTC_USD, maxStalenessSec: 4 * 3600 },
      [guards.WETH]: { aggregator: guards.WETH_USD, maxStalenessSec: 4 * 3600 },
    },
    peg: {
      referenceAggregator: guards.BTC_USD,
      maxDeviationBps: 100,
    },
    approvedTokens: [guards.USDC, guards.CBBTC, guards.WETH],
    routes: routeConfigs.map((r) => ({
      id: r.id,
      name: r.name,
      router: r.cfg.router,
      pool: r.cfg.pool,
      tokenIn: r.cfg.tokenIn,
      tokenOut: r.cfg.tokenOut,
    })),
    adapters,
  });
}

async function readPlanGetters(state, contracts) {
  if (contracts.feeRouter) {
    const feeRouter = await ethers.getContractAt("FeeRouter", contracts.feeRouter);
    guards.assertContractPlanGetters({
      key: "feeRouter",
      getters: { feeRecipient: await feeRouter.feeRecipient() },
      expected: { feeRecipient: guards.MVP_FEE },
    });
  }
  if (contracts.strategyRegistry) {
    const strategyRegistry = await ethers.getContractAt(
      "StrategyPermissionRegistry",
      contracts.strategyRegistry,
    );
    guards.assertContractPlanGetters({
      key: "strategyRegistry",
      getters: {
        permissionRegistry: await strategyRegistry.permissionRegistry(),
        strategyKind: await strategyRegistry.strategyKind(),
        usdc: await strategyRegistry.usdc(),
      },
      expected: {
        permissionRegistry: contracts.permissionRegistry,
        strategyKind: guards.strategyKind(),
        usdc: guards.USDC,
      },
    });
  }
  if (contracts.clExecutor) {
    const cl = await ethers.getContractAt(
      "StableClubConcentratedLiquidityExecutor",
      contracts.clExecutor,
    );
    guards.assertContractPlanGetters({
      key: "clExecutor",
      getters: {
        permissionRegistry: await cl.permissionRegistry(),
        strategyRegistry: await cl.strategyRegistry(),
        feeRouter: await cl.feeRouter(),
        swapRouter: await cl.swapRouter(),
        usdc: await cl.usdc(),
      },
      expected: {
        permissionRegistry: contracts.permissionRegistry,
        strategyRegistry: contracts.strategyRegistry,
        feeRouter: contracts.feeRouter,
        swapRouter: contracts.swapRouter,
        usdc: guards.USDC,
      },
    });
  }
  if (contracts.timelock) {
    const timelock = await ethers.getContractAt("StableClubTimelock", contracts.timelock);
    const proposerRole = await timelock.PROPOSER_ROLE();
    const executorRole = await timelock.EXECUTOR_ROLE();
    const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
    const minDelay = await timelock.getMinDelay();
    guards.assertExactTimelockDelay(minDelay);
    guards.assertDeployerLacksDefaultAdminRole(
      await timelock.hasRole(adminRole, state.deployer),
    );
    guards.assertContractPlanGetters({
      key: "timelock",
      getters: {
        hasProposer: await timelock.hasRole(proposerRole, guards.MVP_SAFE),
        hasExecutor: await timelock.hasRole(executorRole, guards.MVP_SAFE),
        minDelayExact: minDelay === BigInt(guards.TIMELOCK_MIN_DELAY_SECONDS),
      },
      expected: { hasProposer: true, hasExecutor: true, minDelayExact: true },
    });
  }
  if (contracts.safetyController) {
    const safety = await ethers.getContractAt("SafetyController", contracts.safetyController);
    guards.assertContractPlanGetters({
      key: "safetyController",
      getters: {
        guardian: await safety.guardian(),
        maxGasPriceWei: await safety.maxGasPriceWei(),
      },
      expected: {
        guardian: state.guardian,
        maxGasPriceWei: guards.GAS_CEILING_WEI,
      },
    });
  }

  if (contracts.timelock) {
    for (const key of guards.OWNABLE_KEYS) {
      if (!contracts[key]) continue;
      if (!state.steps[`own_${key}`]) continue;
      const c = await ethers.getContractAt(
        key === "clExecutor"
          ? "StableClubConcentratedLiquidityExecutor"
          : key === "swapRouter"
            ? "StableClubSwapRouter"
            : key === "strategyRegistry"
              ? "StrategyPermissionRegistry"
              : key === "permissionRegistry"
                ? "PermissionRegistry"
                : key === "feeRouter"
                  ? "FeeRouter"
                  : key === "oracleGuard"
                    ? "OracleGuard"
                    : key === "mevGuard"
                      ? "MevGuard"
                      : "SafetyController",
        contracts[key],
      );
      guards.assertContractPlanGetters({
        key: `owner_${key}`,
        getters: { owner: await c.owner() },
        expected: { owner: contracts.timelock },
      });
    }
  }
}


async function deployBaseMainnetStack(options = {}) {
  const networkName = options.networkName ?? network.name;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const env = options.env ?? process.env;
  const { guardian } = assertBroadcastAllowed(env, networkName, chainId);

  await assertBaseRpcClientNotLocal(ethers.provider);
  await validateCanonicalDependencies(ethers.provider);

  const [deployer] = await ethers.getSigners();
  const releaseCommit = options.releaseCommit ?? resolveReleaseCommit(env);
  const expectedIdentity = {
    releaseCommit,
    deployer: deployer.address,
    governanceSafe: guards.MVP_SAFE,
    guardian,
    feeRecipient: guards.MVP_FEE,
    configurationHash: guards.computeConfigurationHash(guards.buildConfigurationPlan(guardian)),
  };

  let state = loadState();
  if (state) {
    guards.assertNoUnresolvedCreateEvidence(state);
    await authenticateResumeState(ethers.provider, state, expectedIdentity);
  } else {
    state = guards.buildEmptyDeployState({
      deployer: deployer.address,
      guardian,
      releaseCommit,
    });
    state.poolIds = guards.poolIdHashes();
    state.strategyKind = guards.strategyKind();
    saveState(state);
  }

  guards.assertNoPoolActivation(state);
  // Validate the actual CREATE plan (approved names pass; forbidden names must be absent).
  // Per-CREATE refusal remains in deployNamed → assertContractNotForbidden.
  guards.assertPrivateBetaDeployPlan(guards.BASE_MAINNET_PRIVATE_BETA_CONTRACT_PLAN);

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
  const oracleAddr = await oracleGuard.getAddress();
  const strategyAddr = await strategyRegistry.getAddress();

  await sendStep(
    state,
    "mev_setOracle",
    "mevGuard.setOracle",
    async () => mevGuard.setOracle(oracleAddr),
    async () => {
      if (!guards.addrEq(await mevGuard.oracle(), oracleAddr)) {
        throw new Error("On-chain wiring mismatch: mevGuard.oracle");
      }
    },
  );
  await sendStep(
    state,
    "oracle_usdc",
    "oracleGuard.configureFeed USDC",
    async () => oracleGuard.configureFeed(guards.USDC, guards.USDC_USD, 48 * 3600, 8),
    async () => {
      const feed = await readFeedTuple(oracleGuard, guards.USDC);
      if (!guards.addrEq(feed.aggregator, guards.USDC_USD) || !feed.enabled) {
        throw new Error("On-chain wiring mismatch: USDC feed");
      }
    },
  );
  await sendStep(
    state,
    "oracle_cbbtc",
    "oracleGuard.configureFeed cbBTC",
    async () => oracleGuard.configureFeed(guards.CBBTC, guards.CBBTC_USD, 4 * 3600, 8),
    async () => {
      const feed = await readFeedTuple(oracleGuard, guards.CBBTC);
      if (!guards.addrEq(feed.aggregator, guards.CBBTC_USD) || !feed.enabled) {
        throw new Error("On-chain wiring mismatch: cbBTC feed");
      }
    },
  );
  await sendStep(
    state,
    "oracle_weth",
    "oracleGuard.configureFeed WETH",
    async () => oracleGuard.configureFeed(guards.WETH, guards.WETH_USD, 4 * 3600, 8),
    async () => {
      const feed = await readFeedTuple(oracleGuard, guards.WETH);
      if (!guards.addrEq(feed.aggregator, guards.WETH_USD) || !feed.enabled) {
        throw new Error("On-chain wiring mismatch: WETH feed");
      }
    },
  );
  await sendStep(
    state,
    "oracle_peg",
    "oracleGuard.configurePegMonitor",
    async () => oracleGuard.configurePegMonitor(guards.CBBTC, guards.BTC_USD, 100, 8, true),
    async () => {
      const peg = await readPegTuple(oracleGuard, guards.CBBTC);
      if (!guards.addrEq(peg.referenceAggregator, guards.BTC_USD) || !peg.enabled) {
        throw new Error("On-chain wiring mismatch: peg monitor");
      }
    },
  );

  await sendStep(
    state,
    "perm_registrar",
    "permissionRegistry.setStrategyRegistrar",
    async () => permissionRegistry.setStrategyRegistrar(strategyAddr, true),
    async () => {
      if (!(await permissionRegistry.isStrategyRegistrar(strategyAddr))) {
        throw new Error("On-chain wiring mismatch: strategy registrar");
      }
    },
  );
  await sendStep(
    state,
    "perm_op_cl",
    "permissionRegistry.setOperator cl",
    async () => permissionRegistry.setOperator(clAddr, true),
    async () => {
      if (!(await permissionRegistry.isOperator(clAddr))) {
        throw new Error("On-chain wiring mismatch: permission operator cl");
      }
    },
  );
  await sendStep(
    state,
    "perm_op_strat",
    "permissionRegistry.setOperator strategy",
    async () => permissionRegistry.setOperator(strategyAddr, true),
    async () => {
      if (!(await permissionRegistry.isOperator(strategyAddr))) {
        throw new Error("On-chain wiring mismatch: permission operator strategy");
      }
    },
  );
  await sendStep(
    state,
    "strat_op_cl",
    "strategyRegistry.setOperator",
    async () => strategyRegistry.setOperator(clAddr, true),
    async () => {
      if (!(await strategyRegistry.isOperator(clAddr))) {
        throw new Error("On-chain wiring mismatch: strategy operator cl");
      }
    },
  );
  await sendStep(
    state,
    "fee_exec",
    "feeRouter.setExecutorApproved",
    async () => feeRouter.setExecutorApproved(clAddr, true),
    async () => {
      if (!(await feeRouter.approvedExecutors(clAddr))) {
        throw new Error("On-chain wiring mismatch: fee executor");
      }
    },
  );
  await sendStep(
    state,
    "swap_exec",
    "swapRouter.setExecutorApproved",
    async () => swapRouter.setExecutorApproved(clAddr, true),
    async () => {
      if (!(await swapRouter.approvedExecutors(clAddr))) {
        throw new Error("On-chain wiring mismatch: swap executor");
      }
    },
  );
  await sendStep(
    state,
    "cl_permit2",
    "clExecutor.setPermit2",
    async () => clExecutor.setPermit2(guards.BASE_PERMIT2),
    async () => {
      if (!guards.addrEq(await clExecutor.permit2(), guards.BASE_PERMIT2)) {
        throw new Error("On-chain wiring mismatch: cl permit2");
      }
    },
  );
  await sendStep(
    state,
    "fee_permit2",
    "feeRouter.setPermit2",
    async () => feeRouter.setPermit2(guards.BASE_PERMIT2),
    async () => {
      if (!guards.addrEq(await feeRouter.permit2(), guards.BASE_PERMIT2)) {
        throw new Error("On-chain wiring mismatch: fee permit2");
      }
    },
  );
  for (const [i, token] of [guards.USDC, guards.CBBTC, guards.WETH].entries()) {
    await sendStep(
      state,
      `token_allow_${i}`,
      `clExecutor.setTokenApproval`,
      async () => clExecutor.setTokenApproval(token, true),
      async () => {
        if (!(await clExecutor.approvedTokens(token))) {
          throw new Error(`On-chain wiring mismatch: approved token ${token}`);
        }
      },
    );
  }

  const routeConfigs = guards.buildRouteConfigs();
  for (const r of routeConfigs) {
    await sendStep(
      state,
      `route_${r.name}`,
      `swapRouter.configureRoute`,
      async () => swapRouter.configureRoute(r.id, r.cfg),
      async () => {
        const live = await readRouteTuple(swapRouter, r.id);
        if (!live.enabled || !guards.addrEq(live.pool, r.cfg.pool)) {
          throw new Error(`On-chain wiring mismatch: route ${r.name}`);
        }
      },
    );
  }
  state.routes = routeConfigs.map((r) => ({ name: r.name, routeId: r.id, enabled: true }));
  saveState(state);


  if (!Array.isArray(state.adapters) || state.adapters.length !== guards.EXPECTED_POOL_COUNT) {
    state.adapters = [];
  }
  const specs = guards.buildAdapterSpecs(clAddr);
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const key = `adapter_${i}`;
    const contractName =
      spec.protocol === "uniswap-v3" ? "UniswapV3Adapter" : "AerodromeSlipstreamAdapter";
    guards.assertContractNotForbidden(contractName);

    const factory = await ethers.getContractFactory(contractName);
    const ctorArgs =
      spec.protocol === "uniswap-v3"
        ? [spec.executor, spec.poolId, spec.npm, spec.router, spec.poolAddress, spec.factory, spec.fee]
        : [
            spec.executor,
            spec.poolId,
            spec.npm,
            spec.router,
            spec.poolAddress,
            spec.factory,
            spec.tickSpacing,
            ethers.ZeroAddress,
          ];
    const expectedCreationData = (await factory.getDeployTransaction(...ctorArgs)).data;

    let adapterAddr = state.contracts[key];
    if (adapterAddr || state.deploymentRecords?.[key]) {
      await authenticateSavedContract(ethers.provider, state, key, expectedCreationData);
      adapterAddr = state.contracts[key];
    } else {
      guards.assertNoUnresolvedCreateEvidence(state);
      const artifact = await artifacts.readArtifact(contractName);
      const adapter = await factory.deploy(...ctorArgs);
      adapterAddr = await finalizeCreateFromReceipt(state, {
        key,
        contractName,
        constructorArgs: ctorArgs,
        expectedCreationData,
        expectedDeployedBytecode: artifact.deployedBytecode,
        deploymentTx: adapter.deploymentTransaction(),
      });
    }

    await sendStep(
      state,
      `adapter_approve_${i}`,
      `setAdapterApproval`,
      async () => clExecutor.setAdapterApproval(adapterAddr, true),
      async () => {
        if (!(await clExecutor.approvedAdapters(adapterAddr))) {
          throw new Error(`On-chain wiring mismatch: adapter approval ${i}`);
        }
      },
    );
    await sendStep(
      state,
      `adapter_register_${i}`,
      `registerPool`,
      async () => clExecutor.registerPool(spec.poolId, adapterAddr),
      async () => {
        if (!guards.addrEq(await clExecutor.poolAdapters(spec.poolId), adapterAddr)) {
          throw new Error(`On-chain wiring mismatch: pool registration ${i}`);
        }
      },
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

  await sendStep(
    state,
    "safety_guardian",
    "safetyController.setGuardian",
    async () => safetyController.setGuardian(guardian),
    async () => {
      if (!guards.addrEq(await safetyController.guardian(), guardian)) {
        throw new Error("On-chain wiring mismatch: guardian");
      }
    },
  );
  await sendStep(
    state,
    "safety_gas",
    "safetyController.setMaxGasPriceWei",
    async () => safetyController.setMaxGasPriceWei(guards.GAS_CEILING_WEI),
    async () => {
      if (BigInt(await safetyController.maxGasPriceWei()) !== guards.GAS_CEILING_WEI) {
        throw new Error("On-chain wiring mismatch: gas ceiling");
      }
    },
  );

  // Mandatory aggregate on-chain verification BEFORE Timelock ownership transfer.
  await verifyAggregateOnChainWiring(state, {
    permissionRegistry,
    strategyRegistry,
    feeRouter,
    swapRouter,
    oracleGuard,
    mevGuard,
    safetyController,
    clExecutor,
    clAddr,
    guardian,
  });

  const timelock = await deployNamed(
    "StableClubTimelock",
    [[guards.MVP_SAFE], [guards.MVP_SAFE], guards.MVP_SAFE],
    state,
    "timelock",
  );
  {
    const minDelay = await timelock.getMinDelay();
    guards.assertExactTimelockDelay(minDelay);
    const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
    guards.assertDeployerLacksDefaultAdminRole(
      await timelock.hasRole(adminRole, state.deployer),
    );
  }

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
    await sendStep(
      state,
      `own_${key}`,
      `transferOwnership`,
      async () => {
        const current = await contract.owner();
        if (guards.addrEq(current, timelockAddr)) return null;
        return contract.transferOwnership(timelockAddr);
      },
      async () => {
        const ownerNow = await contract.owner();
        if (!guards.addrEq(ownerNow, timelockAddr)) {
          throw new Error(`Ownership transfer incomplete for ${key}`);
        }
      },
    );
  }


  await readPlanGetters(state, state.contracts);

  // Re-verify aggregate wiring after ownership transfers (fail closed → no completed).
  await verifyAggregateOnChainWiring(state, {
    permissionRegistry,
    strategyRegistry,
    feeRouter,
    swapRouter,
    oracleGuard,
    mevGuard,
    safetyController,
    clExecutor,
    clAddr,
    guardian,
  });

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
  state.adapterOwnershipNote = guards.ADAPTER_OWNERSHIP_NOTE;
  state.poolsActivated = false;
  state.activatedPoolIds = [];
  guards.assertNoPoolActivation(state);
  guards.assertUniqueContractAddresses(state.contracts);
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
  authenticateResumeState,
  authenticateSavedContract,
  verifyAggregateOnChainWiring,
  resolveReleaseCommit,
  finalizeCreateFromReceipt,
  safePredictedCreateAddress,
  atomicWriteJson,
  STATE_PATH,
  ARTIFACT_PATH,
  ARTIFACT_DIR,
  writeFinalArtifact,
  loadState,
  saveState,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(guards.sanitizeErrorMessage(error));
    process.exitCode = 1;
  });
}
