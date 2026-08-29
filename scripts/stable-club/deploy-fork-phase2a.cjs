/**
 * Base-fork Phase 2a/2b deployment script (rehearsal only — no mainnet broadcast).
 * Deploys strategy registry, CL executor, swap router, five adapters, Permit2 wiring,
 * OracleGuard/MevGuard, and the four USDC allowlisted routes covering eight-swap deposits.
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const {
  validatePhase2aManifest,
  EXPECTED_ROUTE_IDS,
  CANONICAL_INFRA,
  BASE_PERMIT2,
} = require("./phase2a-manifest.cjs");

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const MVP_FEE = "0x9d269f7A3d3f781740081D35F086D68a4a21442D";

const USDC_USD = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";
const CBBTC_USD = "0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D";
const BTC_USD = "0x3A932b286715abc4A86a4ACAF68A6cdD89E0d446";
const WETH_USD = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";

const STRATEGY_KIND = ethers.id("STABLE_CLUB_FIVE_POOL_V1");

const POOL_IDS = [
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL10"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_UNI_005"),
];

const POOL_USDC_CBBTC_UNI = "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef";
const POOL_USDC_CBBTC_AERO_L = "0x4e962bb3889bf030368f56810a9c96b83cb3e778";
const POOL_USDC_WETH_UNI = "0xd0b53D9277642d899DF5C87A3966A349A798F224";
const POOL_USDC_WETH_AERO_L = "0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59";
const POOL_CBBTC_WETH_AERO_C = "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b";
const POOL_CBBTC_WETH_AERO_L = "0x70acdf2ad0bf2402c957154f944c19ef4e1cbae1";
const POOL_CBBTC_WETH_UNI = "0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1";

const OUTPUT_PATH = path.join(
  __dirname,
  "../../src/lib/stable-club/generated/fork-phase2a-deployments.json",
);

async function deployAdapter(deployer, spec) {
  if (spec.protocol === "uniswap-v3") {
    return ethers.deployContract("UniswapV3Adapter", [
      spec.executor,
      spec.poolId,
      spec.npm,
      spec.router,
      spec.poolAddress,
      spec.factory,
      spec.fee,
    ]);
  }
  return ethers.deployContract("AerodromeSlipstreamAdapter", [
    spec.executor,
    spec.poolId,
    spec.npm,
    spec.router,
    spec.poolAddress,
    spec.factory,
    spec.tickSpacing,
    ethers.ZeroAddress,
  ]);
}

async function deployForkPhase2aStack() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const strategyRegistry = await ethers.deployContract("StrategyPermissionRegistry", [
    await permissionRegistry.getAddress(),
    STRATEGY_KIND,
    USDC,
  ]);
  const feeRouter = await ethers.deployContract("FeeRouter", [MVP_FEE]);
  const swapRouter = await ethers.deployContract("StableClubSwapRouter");
  const oracleGuard = await ethers.deployContract("OracleGuard");
  const mevGuard = await ethers.deployContract("MevGuard");
  await mevGuard.setOracle(await oracleGuard.getAddress());
  await oracleGuard.configureFeed(USDC, USDC_USD, 48 * 3600, 8);
  await oracleGuard.configureFeed(CBBTC, CBBTC_USD, 4 * 3600, 8);
  await oracleGuard.configureFeed(WETH, WETH_USD, 4 * 3600, 8);
  await oracleGuard.configurePegMonitor(CBBTC, BTC_USD, 100, 8, true);

  const clExecutor = await ethers.deployContract("StableClubConcentratedLiquidityExecutor", [
    await permissionRegistry.getAddress(),
    await strategyRegistry.getAddress(),
    await feeRouter.getAddress(),
    await swapRouter.getAddress(),
    await mevGuard.getAddress(),
    await oracleGuard.getAddress(),
    USDC,
  ]);
  const clAddr = await clExecutor.getAddress();

  await permissionRegistry.setStrategyRegistrar(await strategyRegistry.getAddress(), true);
  await permissionRegistry.setOperator(clAddr, true);
  await permissionRegistry.setOperator(await strategyRegistry.getAddress(), true);
  await strategyRegistry.setOperator(clAddr, true);
  await feeRouter.setExecutorApproved(clAddr, true);
  await swapRouter.setExecutorApproved(clAddr, true);
  await clExecutor.setPermit2(BASE_PERMIT2);
  await feeRouter.setPermit2(BASE_PERMIT2);

  for (const t of [USDC, CBBTC, WETH]) await clExecutor.setTokenApproval(t, true);

  const uni = CANONICAL_INFRA["uniswap-v3"];
  const aeroL = CANONICAL_INFRA["aerodrome-legacy"];
  const aeroC = CANONICAL_INFRA["aerodrome-current"];
  const routeIds = EXPECTED_ROUTE_IDS;

  const routeConfigs = [
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
  for (const r of routeConfigs) await swapRouter.configureRoute(r.id, r.cfg);

  const lpSpecs = [
    {
      poolId: POOL_IDS[0],
      protocol: "aerodrome-slipstream",
      generation: "aerodrome-legacy",
      npm: aeroL.npm,
      router: aeroL.router,
      poolAddress: POOL_USDC_CBBTC_AERO_L,
      factory: aeroL.factory,
      tickSpacing: 100,
      tokenA: USDC,
      tokenB: CBBTC,
    },
    {
      poolId: POOL_IDS[1],
      protocol: "uniswap-v3",
      generation: "uniswap-v3",
      npm: uni.npm,
      router: uni.router,
      poolAddress: POOL_USDC_CBBTC_UNI,
      factory: uni.factory,
      fee: 500,
      tokenA: USDC,
      tokenB: CBBTC,
    },
    {
      poolId: POOL_IDS[2],
      protocol: "aerodrome-slipstream",
      generation: "aerodrome-current",
      npm: aeroC.npm,
      router: aeroC.router,
      poolAddress: POOL_CBBTC_WETH_AERO_C,
      factory: aeroC.factory,
      tickSpacing: 10,
      tokenA: CBBTC,
      tokenB: WETH,
    },
    {
      poolId: POOL_IDS[3],
      protocol: "aerodrome-slipstream",
      generation: "aerodrome-legacy",
      npm: aeroL.npm,
      router: aeroL.router,
      poolAddress: POOL_CBBTC_WETH_AERO_L,
      factory: aeroL.factory,
      tickSpacing: 100,
      tokenA: CBBTC,
      tokenB: WETH,
    },
    {
      poolId: POOL_IDS[4],
      protocol: "uniswap-v3",
      generation: "uniswap-v3",
      npm: uni.npm,
      router: uni.router,
      poolAddress: POOL_CBBTC_WETH_UNI,
      factory: uni.factory,
      fee: 500,
      tokenA: CBBTC,
      tokenB: WETH,
    },
  ];

  const adapters = [];
  for (const spec of lpSpecs) {
    const adapter = await deployAdapter(deployer, { ...spec, executor: clAddr });
    const addr = await adapter.getAddress();
    await clExecutor.setAdapterApproval(addr, true);
    await clExecutor.registerPool(spec.poolId, addr);
    adapters.push({
      poolId: spec.poolId,
      protocol: spec.protocol,
      generation: spec.generation,
      adapter: addr,
      factory: spec.factory,
      npm: spec.npm,
      router: spec.router,
      poolAddress: spec.poolAddress,
      tickSpacing: spec.tickSpacing,
      fee: spec.fee,
    });
  }

  return {
    chainId,
    network: "base-fork",
    isTestOnly: true,
    label: "INDEXLA Stable Club Phase 2a Base-fork stack (TEST ONLY)",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    permissionRegistry: await permissionRegistry.getAddress(),
    strategyRegistry: await strategyRegistry.getAddress(),
    feeRouter: await feeRouter.getAddress(),
    swapRouter: await swapRouter.getAddress(),
    clExecutor: clAddr,
    oracleGuard: await oracleGuard.getAddress(),
    mevGuard: await mevGuard.getAddress(),
    permit2: BASE_PERMIT2,
    usdc: USDC,
    cbbtc: CBBTC,
    weth: WETH,
    poolIds: POOL_IDS,
    adapters,
    routes: routeConfigs.map((r) => ({ name: r.name, routeId: r.id, enabled: true })),
    strategyKind: STRATEGY_KIND,
  };
}

async function main() {
  if (!process.env.BASE_RPC_URL?.trim()) {
    throw new Error("BASE_RPC_URL required for fork deploy script");
  }
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
  });

  const stack = await deployForkPhase2aStack();
  validatePhase2aManifest(stack, { localMocksOk: false });
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(stack, null, 2)}\n`, "utf8");
  console.log("Phase 2a fork deployment manifest written to:");
  console.log(OUTPUT_PATH);
  console.log(
    `permit2=${stack.permit2} routes=${stack.routes.length} adapters=${stack.adapters.length}`,
  );
}

module.exports = {
  deployForkPhase2aStack,
  OUTPUT_PATH,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
