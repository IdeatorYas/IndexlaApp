const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_TEST_POOL_BASE_INTERNAL_V1"),
);

const SQRT_1 = 79228162514264337593543950336n; // 2^96

const OUTPUT_PATH = path.join(
  __dirname,
  "../../src/lib/stable-club/generated/local-deployments.json",
);

const STEP2_CATALOGUE = [
  {
    poolId: "USDC-cbBTC-AERO-CL100",
    poolIdHashLabel: "INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100",
    protocol: "aerodrome",
    tickSpacing: 100,
  },
  {
    poolId: "USDC-cbBTC-UNI-005",
    poolIdHashLabel: "INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005",
    protocol: "uniswap",
    fee: 500,
  },
  {
    poolId: "cbBTC-WETH-AERO-CL10",
    poolIdHashLabel: "INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL10",
    protocol: "aerodrome",
    tickSpacing: 10,
  },
  {
    poolId: "cbBTC-WETH-AERO-CL100",
    poolIdHashLabel: "INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100",
    protocol: "aerodrome",
    tickSpacing: 100,
  },
  {
    poolId: "cbBTC-WETH-UNI-005",
    poolIdHashLabel: "INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_UNI_005",
    protocol: "uniswap",
    fee: 500,
  },
];

async function deployStep2Adapters(deployer, tokenA, tokenB, chainId) {
  let lo = tokenA;
  let hi = tokenB;
  if ((await lo.getAddress()) > (await hi.getAddress())) {
    lo = tokenB;
    hi = tokenA;
  }
  const loAddr = await lo.getAddress();
  const hiAddr = await hi.getAddress();

  const pool = await ethers.deployContract("MockClPoolForValuation", [loAddr, hiAddr, SQRT_1]);
  const poolAddr = await pool.getAddress();

  const uniFactory = await ethers.deployContract("MockUniV3FactoryForValuation");
  const aeroFactory = await ethers.deployContract("MockAeroFactoryForValuation");
  const uniNpm = await ethers.deployContract("MockUniNpmForValuation");
  const aeroNpm = await ethers.deployContract("MockAeroNpmForValuation");

  const uniNpmAddr = await uniNpm.getAddress();
  const aeroNpmAddr = await aeroNpm.getAddress();
  const uniFactoryAddr = await uniFactory.getAddress();
  const aeroFactoryAddr = await aeroFactory.getAddress();

  const step2Adapters = [];

  for (const entry of STEP2_CATALOGUE) {
    if (entry.protocol === "uniswap") {
      await uniFactory.setPool(loAddr, hiAddr, entry.fee, poolAddr);
      const adapter = await ethers.deployContract("UniswapV3Adapter", [
        deployer.address,
        ethers.id(entry.poolIdHashLabel),
        uniNpmAddr,
        deployer.address,
        poolAddr,
        uniFactoryAddr,
        entry.fee,
      ]);
      step2Adapters.push({
        chainId,
        poolId: entry.poolId,
        adapter: await adapter.getAddress(),
        npm: uniNpmAddr,
      });
    } else {
      await aeroFactory.setPool(loAddr, hiAddr, entry.tickSpacing, poolAddr);
      const adapter = await ethers.deployContract("AerodromeSlipstreamAdapter", [
        deployer.address,
        ethers.id(entry.poolIdHashLabel),
        aeroNpmAddr,
        deployer.address,
        poolAddr,
        aeroFactoryAddr,
        entry.tickSpacing,
        ethers.ZeroAddress,
      ]);
      step2Adapters.push({
        chainId,
        poolId: entry.poolId,
        adapter: await adapter.getAddress(),
        npm: aeroNpmAddr,
      });
    }
  }

  return { step2Adapters };
}

const {
  setupGovernanceActivationForAutomation,
  activateOfficialPoolViaTimelock,
} = require("./governance-activation-local.cjs");
const HARVEST_DEV_POOL_LABEL = "USDC-cbBTC-UNI-005";
const HARVEST_DEV_POOL_HASH = ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005");
const AUTOMATION_ACTIONS = (1n << 8n) | (1n << 5n) | (1n << 6n) | (1n << 7n);

async function deployAutomationHarvestStack({
  deployer,
  permissionRegistry,
  step1Executor,
  feeRecipient,
  usdc,
  weth,
  testUser,
  governanceSigners,
}) {
  const automationFeeRouter = await ethers.deployContract("FeeRouter", [feeRecipient]);
  const oracleGuard = await ethers.deployContract("OracleGuard");
  const safetyController = await ethers.deployContract("SafetyController");
  const mevGuard = await ethers.deployContract("MevGuard");
  const openServGate = await ethers.deployContract("OpenServProposalGate");
  const automation = await ethers.deployContract("StableClubAutomationExecutor", [
    await permissionRegistry.getAddress(),
    await automationFeeRouter.getAddress(),
    await oracleGuard.getAddress(),
    await safetyController.getAddress(),
    await mevGuard.getAddress(),
  ]);
  await permissionRegistry.setOperator(await automation.getAddress(), true);
  await automationFeeRouter.wireExecutor(await automation.getAddress());
  await safetyController.wireExecutor(await automation.getAddress());
  await mevGuard.setOracle(await oracleGuard.getAddress());

  const usdcFeed = await ethers.deployContract("MockAggregatorV3", [1_00000000n]);
  const btcFeed = await ethers.deployContract("MockAggregatorV3", [100_00000000n]);
  await oracleGuard.configureFeed(await usdc.getAddress(), await usdcFeed.getAddress(), 3600, 8);
  await oracleGuard.configureFeed(await weth.getAddress(), await btcFeed.getAddress(), 3600, 8);

  const harvestAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
    await automation.getAddress(),
    HARVEST_DEV_POOL_HASH,
    "uniswap-v3",
  ]);
  await automation.setAdapterApproval(await harvestAdapter.getAddress(), true);
  await automation.registerPool(HARVEST_DEV_POOL_HASH, await harvestAdapter.getAddress(), true);
  await automation.setOfficialPoolCatalogue(HARVEST_DEV_POOL_HASH, true);
  await automation.setTokenApproval(await usdc.getAddress(), true);
  await automation.setTokenApproval(await weth.getAddress(), true);

  await usdc.mint(await harvestAdapter.getAddress(), ethers.parseUnits("10000", 6));
  await weth.mint(await harvestAdapter.getAddress(), ethers.parseEther("10"));

  const automationAddr = await automation.getAddress();
  await ethers.provider.send("hardhat_impersonateAccount", [automationAddr]);
  await ethers.provider.send("hardhat_setBalance", [
    automationAddr,
    ethers.toQuantity(ethers.parseEther("1")),
  ]);
  const automationSigner = await ethers.getSigner(automationAddr);
  await usdc.mint(automationAddr, ethers.parseUnits("100", 6));
  await weth.mint(automationAddr, ethers.parseEther("0.01"));
  await usdc.connect(automationSigner).approve(await harvestAdapter.getAddress(), ethers.parseUnits("100", 6));
  await weth.connect(automationSigner).approve(await harvestAdapter.getAddress(), ethers.parseEther("0.01"));
  const mintTx = await harvestAdapter.connect(automationSigner).mintPosition(
    testUser.address,
    await usdc.getAddress(),
    await weth.getAddress(),
    -100000,
    -90000,
    ethers.parseUnits("100", 6),
    ethers.parseEther("0.01"),
    0,
    0,
  );
  await mintTx.wait();
  const tokenId = 1n;
  await harvestAdapter.connect(testUser).approve(await harvestAdapter.getAddress(), tokenId);

  const network = await ethers.provider.getNetwork();
  const perm = {
    user: testUser.address,
    chainId: network.chainId,
    poolId: HARVEST_DEV_POOL_HASH,
    tokenA: await usdc.getAddress(),
    tokenB: await weth.getAddress(),
    allowedActions: AUTOMATION_ACTIONS,
    maxAmountPerTx: 0n,
    maxAmountPerDay: 0n,
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
    revoked: false,
    paused: false,
  };
  await permissionRegistry.connect(testUser).registerPermission(perm);

  const { timelockAddr } = await setupGovernanceActivationForAutomation({
    automation,
    permissionRegistry,
    feeRouter: automationFeeRouter,
    step1Executor,
    oracleGuard,
    mevGuard,
    safetyController,
    openServGate,
    signers: governanceSigners,
  });
  await activateOfficialPoolViaTimelock(automation, timelockAddr, HARVEST_DEV_POOL_HASH);

  const step2AdaptersOverride = [
    {
      chainId: Number(network.chainId),
      poolId: HARVEST_DEV_POOL_LABEL,
      adapter: await harvestAdapter.getAddress(),
      npm: await harvestAdapter.getAddress(),
    },
  ];

  return {
    automationExecutor: await automation.getAddress(),
    safetyController: await safetyController.getAddress(),
    timelockAddr,
    step2AdaptersOverride,
    harvestDev: {
      poolCatalogueId: HARVEST_DEV_POOL_LABEL,
      poolIdHash: HARVEST_DEV_POOL_HASH,
      adapter: await harvestAdapter.getAddress(),
      npm: await harvestAdapter.getAddress(),
      positionTokenId: "1",
      testUser: testUser.address,
    },
  };
}

async function deployStableClubStack() {
  const signers = await ethers.getSigners();
  const [deployer, testUser, feeRecipient] = signers;
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
  const executor = await ethers.deployContract("StableClubExecutor", [
    await permissionRegistry.getAddress(),
    await feeRouter.getAddress(),
  ]);
  await permissionRegistry.setOperator(await executor.getAddress(), true);
  await feeRouter.wireExecutor(await executor.getAddress());

  const testAdapter = await ethers.deployContract("TestPoolAdapter", [
    await executor.getAddress(),
  ]);

  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);

  const usdcAddress = await usdc.getAddress();
  const wethAddress = await weth.getAddress();
  const testAdapterAddress = await testAdapter.getAddress();
  const executorAddress = await executor.getAddress();
  const feeRouterAddress = await feeRouter.getAddress();
  const permissionRegistryAddress = await permissionRegistry.getAddress();

  await executor.setAdapterApproval(testAdapterAddress, true);
  await executor.registerPool(POOL_ID, testAdapterAddress, true);
  await executor.setTokenApproval(usdcAddress, true);
  await executor.setTokenApproval(wethAddress, true);

  const permit2 = await ethers.deployContract("MockPermit2");
  const permit2Address = await permit2.getAddress();
  await feeRouter.setPermit2(permit2Address);
  await executor.setPermit2(permit2Address);

  await usdc.mint(deployer.address, ethers.parseUnits("1000000", 6));
  await usdc.mint(testUser.address, ethers.parseUnits("1000000", 6));
  await weth.mint(testAdapterAddress, ethers.parseEther("100000"));
  await usdc.mint(testAdapterAddress, ethers.parseUnits("1000000", 6));

  const { step2Adapters } = await deployStep2Adapters(deployer, usdc, weth, chainId);

  const automationStack = await deployAutomationHarvestStack({
    deployer,
    permissionRegistry,
    step1Executor: executor,
    feeRecipient: feeRecipient.address,
    usdc,
    weth,
    testUser,
    governanceSigners: signers.slice(0, 3),
  });

  return {
    chainId,
    network: "hardhat-local",
    isTestOnly: true,
    label: "INDEXLA Stable Club local dev deployment (TEST ONLY)",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    testUserAddress: testUser.address,
    feeRecipient: feeRecipient.address,
    permissionRegistry: permissionRegistryAddress,
    feeRouter: feeRouterAddress,
    executor: executorAddress,
    automationExecutor: automationStack.automationExecutor,
    safetyController: automationStack.safetyController,
    timelockAddr: automationStack.timelockAddr,
    testAdapter: testAdapterAddress,
    usdc: usdcAddress,
    weth: wethAddress,
    permit2: permit2Address,
    poolId: POOL_ID,
    rpcUrl: "http://127.0.0.1:8545",
    step2Adapters: automationStack.step2AdaptersOverride ?? step2Adapters,
    harvestDev: automationStack.harvestDev,
    permissionRegistryContract: permissionRegistry,
    feeRouterContract: feeRouter,
    executorContract: executor,
    testAdapterContract: testAdapter,
    usdcContract: usdc,
    wethContract: weth,
    permit2Contract: permit2,
    testUser,
    feeRecipientSigner: feeRecipient,
  };
}

function toDeploymentJson(stack) {
  const {
    permissionRegistryContract,
    feeRouterContract,
    executorContract,
    testAdapterContract,
    usdcContract,
    wethContract,
    permit2Contract,
    testUser,
    feeRecipientSigner,
    ...json
  } = stack;
  return {
    chainId: stack.chainId,
    network: stack.network,
    isTestOnly: stack.isTestOnly,
    label: stack.label,
    deployedAt: stack.deployedAt,
    deployer: stack.deployer,
    testUser: stack.testUserAddress,
    feeRecipient: stack.feeRecipient,
    permissionRegistry: stack.permissionRegistry,
    feeRouter: stack.feeRouter,
    executor: stack.executor,
    testAdapter: stack.testAdapter,
    usdc: stack.usdc,
    weth: stack.weth,
    poolId: stack.poolId,
    rpcUrl: stack.rpcUrl,
    step2Adapters: Array.isArray(stack.step2Adapters) ? stack.step2Adapters : [],
    automationExecutor: stack.automationExecutor,
    safetyController: stack.safetyController,
    harvestDev: stack.harvestDev,
  };
}

async function main() {
  const stack = await deployStableClubStack();
  if (stack.chainId !== 31337 || stack.network !== "hardhat-local") {
    throw new Error(
      `SC-F02: local deploy requires chainId 31337 / hardhat-local (got chainId=${stack.chainId} network=${stack.network})`,
    );
  }
  const deployments = toDeploymentJson(stack);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(deployments, null, 2)}\n`, "utf8");

  console.log("Stable Club local deployment written to:");
  console.log(OUTPUT_PATH);
  console.log(JSON.stringify(deployments, null, 2));
}

/** ERC20 approve → Permit2 (max), then bounded Permit2 allowance to spender.
 *  Uses MaxUint256 for the ERC20→Permit2 allowance so multiple spenders in one
 *  tx (e.g. FeeRouter then Executor) do not overwrite each other's pull capacity.
 */
async function approvePermit2Pull(token, owner, permit2, spender, amount) {
  const { time } = require("@nomicfoundation/hardhat-network-helpers");
  const { ethers } = require("hardhat");
  await token.connect(owner).approve(await permit2.getAddress(), ethers.MaxUint256);
  await permit2
    .connect(owner)
    .approve(await token.getAddress(), spender, amount, BigInt((await time.latest()) + 3600));
}

module.exports = {
  deployStableClubStack,
  toDeploymentJson,
  POOL_ID,
  OUTPUT_PATH,
  approvePermit2Pull,
  setupGovernanceActivationForAutomation,
  activateOfficialPoolViaTimelock,
};

// Phase 2a/2b local CL stack (optional companion entrypoint)
module.exports.deployPhase2aLocalStack = (...args) =>
  require("./deploy-phase2a-local.cjs").deployPhase2aLocalStack(...args);
module.exports.validatePhase2aManifest = (...args) =>
  require("./phase2a-manifest.cjs").validatePhase2aManifest(...args);

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
