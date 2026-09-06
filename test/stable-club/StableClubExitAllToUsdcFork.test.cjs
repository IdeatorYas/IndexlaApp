const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const MVP_FEE = "0x9d269f7A3d3f781740081D35F086D68a4a21442D";

const UNI_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
const UNI_NPM = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const UNI_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";

const AERO_FACTORY_LEGACY = "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A";
const AERO_NPM_LEGACY = "0x827922686190790b37229fd06084350e74485b72";
const AERO_ROUTER_LEGACY = "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5";

const USDC_USD = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";
const CBBTC_USD = "0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D";
const BTC_USD = "0x3A932b286715abc4A86a4ACAF68A6cdD89E0d446";
const WETH_USD = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";

const STRATEGY_KIND = ethers.id("STABLE_CLUB_FIVE_POOL_V1");

const ROUTE_USDC_CBBTC_UNI = ethers.id("ROUTE_USDC_CBBTC_UNI_005");
const ROUTE_USDC_CBBTC_AERO_L = ethers.id("ROUTE_USDC_CBBTC_AERO_LEGACY_100");
const ROUTE_USDC_WETH_UNI = ethers.id("ROUTE_USDC_WETH_UNI_005");
const ROUTE_USDC_WETH_AERO_L = ethers.id("ROUTE_USDC_WETH_AERO_LEGACY_100");
const ROUTE_CBBTC_USDC_UNI = ethers.id("ROUTE_CBBTC_USDC_UNI_005");
const ROUTE_CBBTC_USDC_AERO_L = ethers.id("ROUTE_CBBTC_USDC_AERO_LEGACY_100");
const ROUTE_WETH_USDC_UNI = ethers.id("ROUTE_WETH_USDC_UNI_005");
const ROUTE_WETH_USDC_AERO_L = ethers.id("ROUTE_WETH_USDC_AERO_LEGACY_100");

const POOL_USDC_CBBTC_UNI = "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef";
const POOL_USDC_CBBTC_AERO_L = "0x4e962bb3889bf030368f56810a9c96b83cb3e778";
const POOL_USDC_WETH_UNI = "0xd0b53D9277642d899DF5C87A3966A349A798F224";
const POOL_USDC_WETH_AERO_L = "0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59";
const POOL_CBBTC_WETH_AERO_C = "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b";
const POOL_CBBTC_WETH_AERO_L = "0x70acdf2ad0bf2402c957154f944c19ef4e1cbae1";
const POOL_CBBTC_WETH_UNI = "0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1";

const POOL_IDS = [
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL10"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_UNI_005"),
];

const ALL_ACTIONS =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n) |
  (1n << 4n) |
  (1n << 6n) |
  (1n << 7n) |
  (1n << 8n) | // Harvest
  (1n << 9n); // Compound

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];

const POOL_ABI = ["function tickSpacing() view returns (int24)", "function fee() view returns (uint24)"];

async function resetBaseFork() {
  if (!process.env.BASE_RPC_URL?.trim()) return false;
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
  });
  await network.provider.send("evm_mine", []);
  return true;
}

async function readPoolTick(poolAddress) {
  const slot0Raw = await ethers.provider.call({ to: poolAddress, data: "0x3850c7bd" });
  const tickWord = BigInt(`0x${slot0Raw.slice(66, 130)}`);
  return tickWord >= 1n << 255n ? Number(tickWord - (1n << 256n)) : Number(tickWord);
}

function alignTick(tick, spacing) {
  const compressed = Math.trunc(Number(tick) / spacing);
  return compressed * spacing;
}

async function pullFromPool(pool, token, to, amount) {
  const erc20 = await ethers.getContractAt(ERC20_ABI, token);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [pool] });
  await network.provider.send("hardhat_setBalance", [pool, "0x56BC75E2D63100000"]);
  const signer = await ethers.getSigner(pool);
  await erc20.connect(signer).transfer(to, amount);
}

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

async function deployForkStack() {
  const [deployer, user] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

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

  const safetyController = await ethers.deployContract("SafetyController");
  const clExecutor = await ethers.deployContract("StableClubConcentratedLiquidityExecutor", [
    await permissionRegistry.getAddress(),
    await strategyRegistry.getAddress(),
    await feeRouter.getAddress(),
    await swapRouter.getAddress(),
    await mevGuard.getAddress(),
    await oracleGuard.getAddress(),
    await safetyController.getAddress(),
    USDC,
  ]);
  const clAddr = await clExecutor.getAddress();

  await permissionRegistry.setStrategyRegistrar(await strategyRegistry.getAddress(), true);
  await permissionRegistry.setOperator(clAddr, true);
  await permissionRegistry.setOperator(await strategyRegistry.getAddress(), true);
  await strategyRegistry.setOperator(clAddr, true);
  await feeRouter.setExecutorApproved(clAddr, true);
  await swapRouter.setExecutorApproved(clAddr, true);
  // Canonical Base Permit2 — bounded allowance required for deposits (no unlimited ERC20 to executor).
  await clExecutor.setPermit2(PERMIT2);
  await feeRouter.setPermit2(PERMIT2);
  for (const t of [USDC, CBBTC, WETH]) await clExecutor.setTokenApproval(t, true);

  const routeConfigs = [
    {
      id: ROUTE_USDC_CBBTC_AERO_L,
      cfg: {
        kind: 1,
        router: AERO_ROUTER_LEGACY,
        factory: AERO_FACTORY_LEGACY,
        pool: POOL_USDC_CBBTC_AERO_L,
        tokenIn: USDC,
        tokenOut: CBBTC,
        feeOrTickSpacing: 100,
        enabled: true,
      },
    },
    {
      id: ROUTE_USDC_CBBTC_UNI,
      cfg: {
        kind: 0,
        router: UNI_ROUTER,
        factory: UNI_FACTORY,
        pool: POOL_USDC_CBBTC_UNI,
        tokenIn: USDC,
        tokenOut: CBBTC,
        feeOrTickSpacing: 500,
        enabled: true,
      },
    },
    {
      id: ROUTE_USDC_WETH_UNI,
      cfg: {
        kind: 0,
        router: UNI_ROUTER,
        factory: UNI_FACTORY,
        pool: POOL_USDC_WETH_UNI,
        tokenIn: USDC,
        tokenOut: WETH,
        feeOrTickSpacing: 500,
        enabled: true,
      },
    },
    {
      id: ROUTE_USDC_WETH_AERO_L,
      cfg: {
        kind: 1,
        router: AERO_ROUTER_LEGACY,
        factory: AERO_FACTORY_LEGACY,
        pool: POOL_USDC_WETH_AERO_L,
        tokenIn: USDC,
        tokenOut: WETH,
        feeOrTickSpacing: 100,
        enabled: true,
      },
    },
    {
      id: ROUTE_CBBTC_USDC_UNI,
      cfg: { kind: 0, router: UNI_ROUTER, factory: UNI_FACTORY, pool: POOL_USDC_CBBTC_UNI, tokenIn: CBBTC, tokenOut: USDC, feeOrTickSpacing: 500, enabled: true },
    },
    {
      id: ROUTE_CBBTC_USDC_AERO_L,
      cfg: { kind: 1, router: AERO_ROUTER_LEGACY, factory: AERO_FACTORY_LEGACY, pool: POOL_USDC_CBBTC_AERO_L, tokenIn: CBBTC, tokenOut: USDC, feeOrTickSpacing: 100, enabled: true },
    },
    {
      id: ROUTE_WETH_USDC_UNI,
      cfg: { kind: 0, router: UNI_ROUTER, factory: UNI_FACTORY, pool: POOL_USDC_WETH_UNI, tokenIn: WETH, tokenOut: USDC, feeOrTickSpacing: 500, enabled: true },
    },
    {
      id: ROUTE_WETH_USDC_AERO_L,
      cfg: { kind: 1, router: AERO_ROUTER_LEGACY, factory: AERO_FACTORY_LEGACY, pool: POOL_USDC_WETH_AERO_L, tokenIn: WETH, tokenOut: USDC, feeOrTickSpacing: 100, enabled: true },
    },
];
  for (const r of routeConfigs) await swapRouter.configureRoute(r.id, r.cfg);

  const lpSpecs = [
    {
      poolId: POOL_IDS[0],
      protocol: "aerodrome-slipstream",
      npm: AERO_NPM_LEGACY,
      router: AERO_ROUTER_LEGACY,
      poolAddress: POOL_USDC_CBBTC_AERO_L,
      factory: AERO_FACTORY_LEGACY,
      tickSpacing: 100,
      tokenA: USDC,
      tokenB: CBBTC,
      dualSwap: false,
      swapRoute: ROUTE_USDC_CBBTC_AERO_L,
    },
    {
      poolId: POOL_IDS[1],
      protocol: "uniswap-v3",
      npm: UNI_NPM,
      router: UNI_ROUTER,
      poolAddress: POOL_USDC_CBBTC_UNI,
      factory: UNI_FACTORY,
      fee: 500,
      tokenA: USDC,
      tokenB: CBBTC,
      dualSwap: false,
      swapRoute: ROUTE_USDC_CBBTC_UNI,
    },
    {
      poolId: POOL_IDS[2],
      protocol: "aerodrome-slipstream",
      npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53",
      router: "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F",
      poolAddress: POOL_CBBTC_WETH_AERO_C,
      factory: "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef",
      tickSpacing: 10,
      tokenA: CBBTC,
      tokenB: WETH,
      dualSwap: true,
    },
    {
      poolId: POOL_IDS[3],
      protocol: "aerodrome-slipstream",
      npm: AERO_NPM_LEGACY,
      router: AERO_ROUTER_LEGACY,
      poolAddress: POOL_CBBTC_WETH_AERO_L,
      factory: AERO_FACTORY_LEGACY,
      tickSpacing: 100,
      tokenA: CBBTC,
      tokenB: WETH,
      dualSwap: true,
    },
    {
      poolId: POOL_IDS[4],
      protocol: "uniswap-v3",
      npm: UNI_NPM,
      router: UNI_ROUTER,
      poolAddress: POOL_CBBTC_WETH_UNI,
      factory: UNI_FACTORY,
      fee: 500,
      tokenA: CBBTC,
      tokenB: WETH,
      dualSwap: true,
    },
  ];

  const adapters = [];
  for (const spec of lpSpecs) {
    const adapter = await deployAdapter(deployer, { ...spec, executor: clAddr });
    const addr = await adapter.getAddress();
    await clExecutor.setAdapterApproval(addr, true);
    await clExecutor.registerPool(spec.poolId, addr);
    adapters.push({ ...spec, address: addr, contract: adapter });
  }

  await pullFromPool(POOL_USDC_CBBTC_UNI, USDC, user.address, ethers.parseUnits("5000", 6));

  return {
    user,
    chainId,
    permissionRegistry,
    strategyRegistry,
    feeRouter,
    swapRouter,
    oracleGuard,
    mevGuard,
    clExecutor,
    adapters,
    permit2: PERMIT2,
  };
}

async function registerStrategy(ctx) {
  const expiresAt = BigInt((await time.latest()) + 86400 * 7);
  const strategy = {
    user: ctx.user.address,
    chainId: ctx.chainId,
    depositToken: USDC,
    allowedActions: ALL_ACTIONS,
    maxTotalPerTx: ethers.parseUnits("10000", 6),
    maxTotalPerDay: ethers.parseUnits("50000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt,
    revoked: false,
    paused: false,
  };
  const legPermissions = [];
  const legs = [];
  for (let i = 0; i < 5; i++) {
    const a = ctx.adapters[i];
    const legPerm = {
      user: ctx.user.address,
      chainId: ctx.chainId,
      poolId: a.poolId,
      tokenA: a.tokenA,
      tokenB: a.tokenB,
      allowedActions: ALL_ACTIONS,
      maxAmountPerTx: ethers.parseUnits("2000", 6),
      maxAmountPerDay: ethers.parseUnits("10000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt,
      revoked: false,
      paused: false,
    };
    const legPermissionId = await ctx.permissionRegistry.permissionIdFor(
      legPerm.user,
      legPerm.chainId,
      legPerm.poolId,
      legPerm.tokenA,
      legPerm.tokenB,
    );
    legPermissions.push(legPerm);
    legs.push({
      poolId: a.poolId,
      allocationBps: 2000n,
      adapter: a.address,
      tokenA: a.tokenA,
      tokenB: a.tokenB,
      legPermissionId,
      maxLegPerTx: ethers.parseUnits("2000", 6),
      maxLegPerDay: ethers.parseUnits("10000", 6),
    });
  }
  await ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs);
  const strategyId = await ctx.strategyRegistry.strategyIdFor(ctx.user.address, ctx.chainId, USDC);
  return { strategyId };
}

const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
];

async function approveUsdcViaPermit2(user, clExecutorAddr, grossUsdc) {
  const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
  const permit2 = await ethers.getContractAt(PERMIT2_ABI, PERMIT2);
  await usdc.connect(user).approve(PERMIT2, grossUsdc);
  const expiration = BigInt((await time.latest()) + 3600);
  await permit2.connect(user).approve(USDC, clExecutorAddr, grossUsdc, expiration);
  return { usdc, permit2, expiration };
}

async function oracleSwapQuote(ctx, tokenOut, grossUsdc) {
  const net = (grossUsdc * 9900n) / 10000n;
  const decOut = tokenOut.toLowerCase() === WETH.toLowerCase() ? 18 : 8;
  const expected = await ctx.oracleGuard.expectedAmountOut(USDC, tokenOut, net, 6, decOut);
  const minOut = (expected * 9900n) / 10000n;
  return { expected, minOut, net };
}

async function buildDepositLegs(ctx, grossUsdc) {
  const legBudget = grossUsdc / 5n;
  const half = legBudget / 2n;
  const deadline = BigInt((await time.latest()) + 3600);
  const slippageBps = 500n;
  const emptySwap = {
    routeId: ethers.ZeroHash,
    grossUsdcIn: 0n,
    minOut: 0n,
    quotedOut: 0n,
    deadline: 0n,
  };
  const legs = [];

  for (let i = 0; i < 5; i++) {
    const a = ctx.adapters[i];
    const pool = await ethers.getContractAt(POOL_ABI, a.poolAddress);
    const spacing =
      a.protocol === "uniswap-v3" ? Number(await pool.tickSpacing()) : Number(a.tickSpacing);
    const tick = await readPoolTick(a.poolAddress);
    const tickLower = alignTick(tick - spacing * 10, spacing);
    const tickUpper = alignTick(tick + spacing * 10, spacing);

    if (!a.dualSwap) {
      const q = await oracleSwapQuote(ctx, CBBTC, half);
      legs.push({
        legIndex: i,
        adapter: a.address,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
        tickLower,
        tickUpper,
        retainUsdc: half,
        swaps: [
          {
            routeId: a.swapRoute,
            grossUsdcIn: half,
            minOut: q.minOut,
            quotedOut: q.expected,
            deadline,
          },
          emptySwap,
        ],
        swapCount: 1,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps,
      });
    } else {
      const qCb = await oracleSwapQuote(ctx, CBBTC, half);
      const qWe = await oracleSwapQuote(ctx, WETH, half);
      legs.push({
        legIndex: i,
        adapter: a.address,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
        tickLower,
        tickUpper,
        retainUsdc: 0n,
        swaps: [
          {
            routeId: ROUTE_USDC_CBBTC_UNI,
            grossUsdcIn: half,
            minOut: qCb.minOut,
            quotedOut: qCb.expected,
            deadline,
          },
          {
            routeId: ROUTE_USDC_WETH_UNI,
            grossUsdcIn: half,
            minOut: qWe.minOut,
            quotedOut: qWe.expected,
            deadline,
          },
        ],
        swapCount: 2,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps,
      });
    }
  }
  return legs;
}

describe("Base-fork exitAllToUsdc + reverse routes", function () {
  this.timeout(900_000);
  let forkAvailable = false;

  before(async function () {
    forkAvailable = !!process.env.BASE_RPC_URL?.trim();
    if (!forkAvailable) this.skip();
  });

  beforeEach(async function () {
    if (!forkAvailable) this.skip();
    await resetBaseFork();
  });

  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  async function depositCollectingPositions(ctx, strategyId, nonce) {
    const grossUsdc = ethers.parseUnits("1000", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    await approveUsdcViaPermit2(ctx.user, await ctx.clExecutor.getAddress(), grossUsdc);

    const beforeBlocks = await ethers.provider.getBlockNumber();
    await (
      await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        nonce,
        grossUsdc,
        POOL_IDS,
        BigInt((await time.latest()) + 3600),
        legs,
      )
    ).wait();

    const positions = [];
    for (const a of ctx.adapters) {
      const npm = await ethers.getContractAt(
        [
          "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
          "function approve(address to, uint256 tokenId)",
          "function ownerOf(uint256 tokenId) view returns (address)",
        ],
        a.npm,
      );
      const logs = await npm.queryFilter(
        npm.filters.Transfer(ethers.ZeroAddress, ctx.user.address),
        beforeBlocks,
      );
      expect(logs.length, `${a.poolId} mint`).to.be.greaterThan(0);

      let tokenId;
      for (let i = logs.length - 1; i >= 0; i--) {
        const candidate = logs[i].args.tokenId;
        try {
          if ((await a.contract.ownerOf(candidate)).toLowerCase() !== ctx.user.address.toLowerCase()) {
            continue;
          }
          const [t0, t1] = await a.contract.positionTokens(candidate);
          const [e0, e1] =
            a.tokenA.toLowerCase() < a.tokenB.toLowerCase()
              ? [a.tokenA, a.tokenB]
              : [a.tokenB, a.tokenA];
          if (t0.toLowerCase() !== e0.toLowerCase() || t1.toLowerCase() !== e1.toLowerCase()) {
            continue;
          }
          const amounts = await a.contract.positionAmounts(candidate);
          if (amounts[0] + amounts[1] === 0n) continue;
          tokenId = candidate;
          break;
        } catch {
          // wrong pool identity / generation for this adapter
        }
      }
      if (tokenId === undefined) {
        throw new Error(`matched NFT for ${a.poolId} not found among ${logs.length} mint(s)`);
      }

      const positionsAbi =
        a.protocol === "uniswap-v3"
          ? [
              "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
            ]
          : [
              "function positions(uint256) view returns (uint96,address,address,address,int24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
            ];
      const npmPos = await ethers.getContractAt(positionsAbi, a.npm);
      const liquidity = (await npmPos.positions(tokenId))[7];
      expect(liquidity, `${a.poolId} liquidity`).to.be.gt(0n);
      positions.push({ adapter: a, tokenId, liquidity, npm });
    }
    return positions;
  }

  it("proves upgraded executor returns only USDC via reverse Uni/Aero routes", async function () {
    const ctx = await deployForkStack();
    for (const routeId of [ROUTE_CBBTC_USDC_UNI, ROUTE_CBBTC_USDC_AERO_L, ROUTE_WETH_USDC_UNI, ROUTE_WETH_USDC_AERO_L]) {
      const route = await ctx.swapRouter.getRoute(routeId);
      expect(route.enabled).to.equal(true);
      expect(route.tokenOut.toLowerCase()).to.equal(USDC.toLowerCase());
    }
    const code = await ethers.provider.getCode(await ctx.clExecutor.getAddress());
    const sel = ethers.id(
      "exitAllToUsdc(bytes32,(uint8,address,address,address,uint256,uint128,uint256,uint256,uint256,bool)[5],(bytes32,uint256,uint256,uint256,uint256)[8],uint8,uint256,uint256)",
    ).slice(2, 10);
    expect(code.toLowerCase()).to.include(sel);

    const { strategyId } = await registerStrategy(ctx);
    const positions = await depositCollectingPositions(ctx, strategyId, 7n);

    const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
    const cbbtc = await ethers.getContractAt(ERC20_ABI, CBBTC);
    const weth = await ethers.getContractAt(ERC20_ABI, WETH);

    const exitLegs = [];
    let aggCb = 0n;
    let aggWeth = 0n;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const a = p.adapter;
      const amounts = await a.contract.positionAmounts(p.tokenId);
      const [t0, t1] = await a.contract.positionTokens(p.tokenId);
      if (t0.toLowerCase() === CBBTC.toLowerCase()) aggCb += amounts[0];
      if (t1.toLowerCase() === CBBTC.toLowerCase()) aggCb += amounts[1];
      if (t0.toLowerCase() === WETH.toLowerCase()) aggWeth += amounts[0];
      if (t1.toLowerCase() === WETH.toLowerCase()) aggWeth += amounts[1];
      await p.npm.connect(ctx.user).approve(a.address, p.tokenId);
      exitLegs.push({
        legIndex: i,
        adapter: a.address,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
        positionTokenId: p.tokenId,
        liquidity: 0n,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 500n,
        fullExit: true,
      });
    }

    const deadline = BigInt((await time.latest()) + 3600);
    const swaps = Array.from({ length: 8 }, () => ({ routeId: ethers.ZeroHash, amountIn: 0n, minOut: 0n, quotedOut: 0n, deadline: 0n }));
    let swapCount = 0;
    if (aggCb > 0n) {
      const quoted = await ctx.oracleGuard.expectedAmountOut(CBBTC, USDC, aggCb, 8, 6);
      swaps[swapCount++] = { routeId: ROUTE_CBBTC_USDC_UNI, amountIn: aggCb, minOut: (quoted * 9900n) / 10000n, quotedOut: quoted, deadline };
    }
    if (aggWeth > 0n) {
      const quoted = await ctx.oracleGuard.expectedAmountOut(WETH, USDC, aggWeth, 18, 6);
      swaps[swapCount++] = { routeId: ROUTE_WETH_USDC_UNI, amountIn: aggWeth, minOut: (quoted * 9900n) / 10000n, quotedOut: quoted, deadline };
    }

    const usdcBefore = await usdc.balanceOf(ctx.user.address);
    const cbbtcBefore = await cbbtc.balanceOf(ctx.user.address);
    const wethBefore = await weth.balanceOf(ctx.user.address);
    await ctx.clExecutor.connect(ctx.user).exitAllToUsdc(strategyId, exitLegs, swaps, swapCount, 1n, 100n);
    expect(await usdc.balanceOf(ctx.user.address)).to.be.gt(usdcBefore);
    expect(await cbbtc.balanceOf(ctx.user.address)).to.equal(cbbtcBefore);
    expect(await weth.balanceOf(ctx.user.address)).to.equal(wethBefore);
  });

  it("Safe-owned-equivalent: deposit → harvestAll → compoundAll → exitAllToUsdc (USDC-only; never exitAll)", async function () {
    const ctx = await deployForkStack();
    // Deployer stands in as Safe for config; no Timelock in this stack.
    expect(await ctx.clExecutor.owner()).to.equal((await ethers.getSigners())[0].address);

    const harvestSel = ethers
      .id(
        "harvestAll(bytes32,(uint8,address,address,address,uint256,uint256,uint256,uint256)[5],uint256)",
      )
      .slice(2, 10);
    const compoundSel = ethers
      .id(
        "compoundAll(bytes32,(uint8,address,address,address,uint256,uint256,uint256,uint256)[5],uint256)",
      )
      .slice(2, 10);
    const exitAllSel = ethers.id("exitAll(bytes32,(uint8,address,address,address,uint256,uint128,uint256,uint256,uint256,bool)[5],uint256)").slice(2, 10);
    const code = (await ethers.provider.getCode(await ctx.clExecutor.getAddress())).toLowerCase();
    expect(code).to.include(harvestSel);
    expect(code).to.include(compoundSel);
    // Legacy exitAll may remain in bytecode but product path must never call it.
    expect(code).to.include(exitAllSel);

    const { strategyId } = await registerStrategy(ctx);
    const positions = await depositCollectingPositions(ctx, strategyId, 11n);

    const manageLegs = [];
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const a = p.adapter;
      await p.npm.connect(ctx.user).approve(a.address, p.tokenId);
      manageLegs.push({
        legIndex: i,
        adapter: a.address,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
        positionTokenId: p.tokenId,
        amountAMin: 0n,
        amountBMin: 0n,
        slippageBps: 500n,
      });
    }
    // Pad to exactly 5 — deposit always opens five legs.
    expect(manageLegs.length).to.equal(5);

    // harvestAll: fees/rewards → user (zero fees is a clean no-op per leg after permission check).
    await ctx.clExecutor.connect(ctx.user).harvestAll(strategyId, manageLegs, 100n);

    // compoundAll: fee reinvest or clean no-op when fees are zero.
    await ctx.clExecutor.connect(ctx.user).compoundAll(strategyId, manageLegs, 200n);

    const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
    const cbbtc = await ethers.getContractAt(ERC20_ABI, CBBTC);
    const weth = await ethers.getContractAt(ERC20_ABI, WETH);

    const exitLegs = [];
    let aggCb = 0n;
    let aggWeth = 0n;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const a = p.adapter;
      const amounts = await a.contract.positionAmounts(p.tokenId);
      const [t0, t1] = await a.contract.positionTokens(p.tokenId);
      if (t0.toLowerCase() === CBBTC.toLowerCase()) aggCb += amounts[0];
      if (t1.toLowerCase() === CBBTC.toLowerCase()) aggCb += amounts[1];
      if (t0.toLowerCase() === WETH.toLowerCase()) aggWeth += amounts[0];
      if (t1.toLowerCase() === WETH.toLowerCase()) aggWeth += amounts[1];
      exitLegs.push({
        legIndex: i,
        adapter: a.address,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
        positionTokenId: p.tokenId,
        liquidity: 0n,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 500n,
        fullExit: true,
      });
    }

    const deadline = BigInt((await time.latest()) + 3600);
    const swaps = Array.from({ length: 8 }, () => ({
      routeId: ethers.ZeroHash,
      amountIn: 0n,
      minOut: 0n,
      quotedOut: 0n,
      deadline: 0n,
    }));
    let swapCount = 0;
    if (aggCb > 0n) {
      const quoted = await ctx.oracleGuard.expectedAmountOut(CBBTC, USDC, aggCb, 8, 6);
      swaps[swapCount++] = {
        routeId: ROUTE_CBBTC_USDC_UNI,
        amountIn: aggCb,
        minOut: (quoted * 9900n) / 10000n,
        quotedOut: quoted,
        deadline,
      };
    }
    if (aggWeth > 0n) {
      const quoted = await ctx.oracleGuard.expectedAmountOut(WETH, USDC, aggWeth, 18, 6);
      swaps[swapCount++] = {
        routeId: ROUTE_WETH_USDC_UNI,
        amountIn: aggWeth,
        minOut: (quoted * 9900n) / 10000n,
        quotedOut: quoted,
        deadline,
      };
    }

    const usdcBefore = await usdc.balanceOf(ctx.user.address);
    const cbbtcBefore = await cbbtc.balanceOf(ctx.user.address);
    const wethBefore = await weth.balanceOf(ctx.user.address);

    // Product path: exitAllToUsdc only — never legacy exitAll.
    await ctx.clExecutor
      .connect(ctx.user)
      .exitAllToUsdc(strategyId, exitLegs, swaps, swapCount, 1n, 100n);

    expect(await usdc.balanceOf(ctx.user.address)).to.be.gt(usdcBefore);
    expect(await cbbtc.balanceOf(ctx.user.address)).to.equal(cbbtcBefore);
    expect(await weth.balanceOf(ctx.user.address)).to.equal(wethBefore);
  });

  it("harvestAll / compoundAll edge cases: wrong user + missing NFT approval", async function () {
    const ctx = await deployForkStack();
    const [, , stranger] = await ethers.getSigners();
    const { strategyId } = await registerStrategy(ctx);
    const positions = await depositCollectingPositions(ctx, strategyId, 13n);

    const manageLegs = positions.map((p, i) => ({
      legIndex: i,
      adapter: p.adapter.address,
      tokenA: p.adapter.tokenA,
      tokenB: p.adapter.tokenB,
      positionTokenId: p.tokenId,
      amountAMin: 0n,
      amountBMin: 0n,
      slippageBps: 500n,
    }));

    await expect(
      ctx.clExecutor.connect(stranger).harvestAll(strategyId, manageLegs, 300n),
    ).to.be.reverted;

    // No NPM approve → adapter collect should fail for harvest.
    await expect(
      ctx.clExecutor.connect(ctx.user).harvestAll(strategyId, manageLegs, 301n),
    ).to.be.reverted;
  });
});
