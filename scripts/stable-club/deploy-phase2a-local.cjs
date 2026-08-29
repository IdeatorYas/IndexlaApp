/**
 * Phase 2a/2b local stack: StrategyPermissionRegistry, CL executor, swap router,
 * five mock adapters, MockPermit2, OracleGuard/MevGuard, and allowlisted USDC routes.
 * TEST ONLY — never for mainnet.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const {
  validatePhase2aManifest,
  EXPECTED_ROUTE_IDS,
  CANONICAL_INFRA,
} = require("./phase2a-manifest.cjs");

const STRATEGY_KIND = ethers.id("STABLE_CLUB_FIVE_POOL_V1");
const BASE_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const POOL_IDS = [
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL10"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_UNI_005"),
];

const OUTPUT_PATH = path.join(
  __dirname,
  "../../src/lib/stable-club/generated/local-phase2a-deployments.json",
);

async function deployPhase2aLocalStack(opts = {}) {
  const [deployer, testUser, feeRecipient] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const cbbtc = await ethers.deployContract("MockERC20", ["Coinbase BTC", "cbBTC", 8]);
  const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);
  const tokens = {
    usdc: await usdc.getAddress(),
    cbbtc: await cbbtc.getAddress(),
    weth: await weth.getAddress(),
  };

  const oracleGuard = await ethers.deployContract("OracleGuard");
  const mevGuard = await ethers.deployContract("MevGuard");
  await mevGuard.setOracle(await oracleGuard.getAddress());
  const usdcFeed = await ethers.deployContract("MockAggregatorV3", [100_000000n]);
  const cbbtcFeed = await ethers.deployContract("MockAggregatorV3", [100_000_00000000n]);
  const wethFeed = await ethers.deployContract("MockAggregatorV3", [2_000_00000000n]);
  await oracleGuard.configureFeed(tokens.usdc, await usdcFeed.getAddress(), 3600, 8);
  await oracleGuard.configureFeed(tokens.cbbtc, await cbbtcFeed.getAddress(), 3600, 8);
  await oracleGuard.configureFeed(tokens.weth, await wethFeed.getAddress(), 3600, 8);

  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const strategyRegistry = await ethers.deployContract("StrategyPermissionRegistry", [
    await permissionRegistry.getAddress(),
    STRATEGY_KIND,
    tokens.usdc,
  ]);
  const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
  const swapRouter = await ethers.deployContract("MockSwapRouter");
  const clExecutor = await ethers.deployContract("StableClubConcentratedLiquidityExecutor", [
    await permissionRegistry.getAddress(),
    await strategyRegistry.getAddress(),
    await feeRouter.getAddress(),
    await swapRouter.getAddress(),
    await mevGuard.getAddress(),
    await oracleGuard.getAddress(),
    tokens.usdc,
  ]);

  const clAddr = await clExecutor.getAddress();
  const strategyAddr = await strategyRegistry.getAddress();
  await permissionRegistry.setStrategyRegistrar(strategyAddr, true);
  await permissionRegistry.setOperator(clAddr, true);
  await permissionRegistry.setOperator(strategyAddr, true);
  await strategyRegistry.setOperator(clAddr, true);
  await feeRouter.setExecutorApproved(clAddr, true);
  await swapRouter.setExecutorApproved(clAddr, true);

  const permit2 = await ethers.deployContract("MockPermit2");
  const permit2Addr = await permit2.getAddress();
  await clExecutor.setPermit2(permit2Addr);
  await feeRouter.setPermit2(permit2Addr);

  for (const t of [tokens.usdc, tokens.cbbtc, tokens.weth]) {
    await clExecutor.setTokenApproval(t, true);
  }

  // Four unique USDC→asset routes covering the eight-swap deposit plan.
  const routeIds = EXPECTED_ROUTE_IDS;
  const baseRoute = (tokenOut) => ({
    kind: 0,
    router: deployer.address,
    factory: deployer.address,
    pool: deployer.address,
    tokenIn: tokens.usdc,
    tokenOut,
    feeOrTickSpacing: 500,
    enabled: true,
  });
  await swapRouter.configureRoute(routeIds.USDC_CBBTC_UNI, baseRoute(tokens.cbbtc));
  await swapRouter.configureRoute(routeIds.USDC_CBBTC_AERO_L, baseRoute(tokens.cbbtc));
  await swapRouter.configureRoute(routeIds.USDC_WETH_UNI, baseRoute(tokens.weth));
  await swapRouter.configureRoute(routeIds.USDC_WETH_AERO_L, baseRoute(tokens.weth));

  const sampleNet = (ethers.parseUnits("100", 6) * 9900n) / 10000n;
  const expectedCb = await oracleGuard.expectedAmountOut(tokens.usdc, tokens.cbbtc, sampleNet, 6, 8);
  const expectedWe = await oracleGuard.expectedAmountOut(tokens.usdc, tokens.weth, sampleNet, 6, 18);
  const rateCb = (expectedCb * 10n ** 18n) / sampleNet;
  const rateWe = (expectedWe * 10n ** 18n) / sampleNet;
  await swapRouter.setRate(routeIds.USDC_CBBTC_UNI, rateCb);
  await swapRouter.setRate(routeIds.USDC_CBBTC_AERO_L, rateCb);
  await swapRouter.setRate(routeIds.USDC_WETH_UNI, rateWe);
  await swapRouter.setRate(routeIds.USDC_WETH_AERO_L, rateWe);

  await cbbtc.mint(await swapRouter.getAddress(), ethers.parseUnits("1000000", 8));
  await weth.mint(await swapRouter.getAddress(), ethers.parseUnits("1000000", 18));
  await usdc.mint(testUser.address, ethers.parseUnits("1000000", 6));

  const catalogue = [
    { poolId: POOL_IDS[0], protocol: "aerodrome-slipstream", tokenA: tokens.usdc, tokenB: tokens.cbbtc },
    { poolId: POOL_IDS[1], protocol: "uniswap-v3", tokenA: tokens.usdc, tokenB: tokens.cbbtc },
    { poolId: POOL_IDS[2], protocol: "aerodrome-slipstream", tokenA: tokens.cbbtc, tokenB: tokens.weth },
    { poolId: POOL_IDS[3], protocol: "aerodrome-slipstream", tokenA: tokens.cbbtc, tokenB: tokens.weth },
    { poolId: POOL_IDS[4], protocol: "uniswap-v3", tokenA: tokens.cbbtc, tokenB: tokens.weth },
  ];
  const adapters = [];
  for (const entry of catalogue) {
    const adapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      clAddr,
      entry.poolId,
      entry.protocol,
    ]);
    const addr = await adapter.getAddress();
    await clExecutor.setAdapterApproval(addr, true);
    await clExecutor.registerPool(entry.poolId, addr);
    adapters.push({
      poolId: entry.poolId,
      protocol: entry.protocol,
      adapter: addr,
      tokenA: entry.tokenA,
      tokenB: entry.tokenB,
      // Local mocks — identity fields mirror catalogue generations for manifest checks
      factory: opts.useCanonicalInfra ? CANONICAL_INFRA[entry.protocol]?.factory : deployer.address,
      npm: opts.useCanonicalInfra ? CANONICAL_INFRA[entry.protocol]?.npm : deployer.address,
      router: opts.useCanonicalInfra ? CANONICAL_INFRA[entry.protocol]?.router : deployer.address,
    });
  }

  const routeList = Object.entries(routeIds).map(([name, id]) => ({
    name,
    routeId: id,
    enabled: true,
  }));

  return {
    chainId,
    network: "hardhat-local",
    isTestOnly: true,
    label: "INDEXLA Stable Club Phase 2a local stack (TEST ONLY)",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    testUser: testUser.address,
    feeRecipient: feeRecipient.address,
    permissionRegistry: await permissionRegistry.getAddress(),
    strategyRegistry: strategyAddr,
    feeRouter: await feeRouter.getAddress(),
    swapRouter: await swapRouter.getAddress(),
    clExecutor: clAddr,
    oracleGuard: await oracleGuard.getAddress(),
    mevGuard: await mevGuard.getAddress(),
    permit2: permit2Addr,
    canonicalBasePermit2: BASE_PERMIT2,
    usdc: tokens.usdc,
    cbbtc: tokens.cbbtc,
    weth: tokens.weth,
    poolIds: POOL_IDS,
    adapters,
    routes: routeList,
    strategyKind: STRATEGY_KIND,
    // contracts for tests
    contracts: {
      permissionRegistry,
      strategyRegistry,
      feeRouter,
      swapRouter,
      clExecutor,
      oracleGuard,
      mevGuard,
      permit2,
      usdc,
      cbbtc,
      weth,
      testUser,
    },
  };
}

function toPhase2aDeploymentJson(stack) {
  const { contracts, ...json } = stack;
  return json;
}

async function main() {
  const stack = await deployPhase2aLocalStack();
  const deployments = toPhase2aDeploymentJson(stack);
  validatePhase2aManifest(deployments, { localMocksOk: true });
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(deployments, null, 2)}\n`, "utf8");
  console.log("Phase 2a local deployment written to:");
  console.log(OUTPUT_PATH);
  console.log(`routes=${deployments.routes.length} adapters=${deployments.adapters.length} permit2=${deployments.permit2}`);
}

module.exports = {
  deployPhase2aLocalStack,
  toPhase2aDeploymentJson,
  OUTPUT_PATH,
  POOL_IDS,
  STRATEGY_KIND,
  EXPECTED_ROUTE_IDS,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
