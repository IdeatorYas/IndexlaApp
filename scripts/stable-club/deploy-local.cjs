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

async function deployStableClubStack() {
  const [deployer, testUser, feeRecipient] = await ethers.getSigners();
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

  await usdc.mint(deployer.address, ethers.parseUnits("1000000", 6));
  await usdc.mint(testUser.address, ethers.parseUnits("1000000", 6));
  await weth.mint(testAdapterAddress, ethers.parseEther("100000"));
  await usdc.mint(testAdapterAddress, ethers.parseUnits("1000000", 6));

  const { step2Adapters } = await deployStep2Adapters(deployer, usdc, weth, chainId);

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
    testAdapter: testAdapterAddress,
    usdc: usdcAddress,
    weth: wethAddress,
    poolId: POOL_ID,
    rpcUrl: "http://127.0.0.1:8545",
    step2Adapters,
    permissionRegistryContract: permissionRegistry,
    feeRouterContract: feeRouter,
    executorContract: executor,
    testAdapterContract: testAdapter,
    usdcContract: usdc,
    wethContract: weth,
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

module.exports = {
  deployStableClubStack,
  toDeploymentJson,
  POOL_ID,
  OUTPUT_PATH,
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
