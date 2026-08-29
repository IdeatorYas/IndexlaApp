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
  (1n << 0n) | (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 6n) | (1n << 7n);

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

describe("Phase 2a — Base fork USDC-only five-pool deposit", function () {
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

  it("depositFivePoolStrategy: 1000 USDC, 8 swaps, 8 fees, 5 NFTs, gas recorded", async function () {
    const ctx = await deployForkStack();
    const { strategyId } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("1000", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
    await approveUsdcViaPermit2(ctx.user, await ctx.clExecutor.getAddress(), grossUsdc);

    const userBefore = await usdc.balanceOf(ctx.user.address);
    const tx = await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      1n,
      grossUsdc,
      POOL_IDS,
      BigInt((await time.latest()) + 3600),
      legs,
    );
    const receipt = await tx.wait();

    const userAfter = await usdc.balanceOf(ctx.user.address);
    // Gross USDC pulled; tiny residual dust may return from CL mint rounding.
    const spent = userBefore - userAfter;
    expect(spent).to.be.gte(grossUsdc - ethers.parseUnits("5", 6));
    expect(spent).to.be.lte(grossUsdc);
    expect(await usdc.balanceOf(await ctx.clExecutor.getAddress())).to.equal(0n);
    expect(await usdc.balanceOf(await ctx.feeRouter.getAddress())).to.equal(0n);

    const feeEvents = receipt.logs.filter((log) => {
      try {
        return ctx.feeRouter.interface.parseLog(log)?.name === "SwapFeeCharged";
      } catch {
        return false;
      }
    });
    expect(feeEvents.length).to.equal(8);

    for (const a of ctx.adapters) {
      const npm = a.protocol === "uniswap-v3" ? UNI_NPM : a.npm;
      const nft = await ethers.getContractAt(
        ["function balanceOf(address) view returns (uint256)"],
        npm,
      );
      expect(await nft.balanceOf(ctx.user.address)).to.be.gte(1n);
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n[Phase2bForkDeposit] Permit2=${PERMIT2} gasUsed=${receipt.gasUsed.toString()}\n`,
    );
    expect(receipt.gasUsed).to.be.lt(30_000_000n);

    // Permit2 allowance consumed (bounded) — no residual unlimited spend
    const permit2 = await ethers.getContractAt(PERMIT2_ABI, PERMIT2);
    const [remaining] = await permit2.allowance(
      ctx.user.address,
      USDC,
      await ctx.clExecutor.getAddress(),
    );
    expect(remaining).to.equal(0n);
  });

  it("atomic failure on leg 3 leaves zero NFTs and unchanged nonce", async function () {
    const ctx = await deployForkStack();
    const { strategyId } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("1000", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    legs[2].amountAMin = ethers.MaxUint256;
    const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
    await approveUsdcViaPermit2(ctx.user, await ctx.clExecutor.getAddress(), grossUsdc);

    const feeBefore = await usdc.balanceOf(MVP_FEE);
    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        99n,
        grossUsdc,
        POOL_IDS,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.reverted;

    expect(await ctx.strategyRegistry.strategyDepositNonceUsed(strategyId, 99n)).to.equal(false);
    expect(await usdc.balanceOf(MVP_FEE)).to.equal(feeBefore);
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

  it("exitLeg partial keeps NFT; fullExit/exitAll/emergency burn NFTs; direct NPM", async function () {
    const ctx = await deployForkStack();
    const { strategyId } = await registerStrategy(ctx);
    const positions = await depositCollectingPositions(ctx, strategyId, 10n);

    // Partial exitLeg on Uni USDC/cbBTC (leg 1) — NFT retained with residual liquidity
    const uniPos = positions[1];
    await uniPos.npm.connect(ctx.user).approve(uniPos.adapter.address, uniPos.tokenId);
    const halfLiq = uniPos.liquidity / 2n;
    await ctx.clExecutor.connect(ctx.user).exitLeg(
      strategyId,
      {
        legIndex: 1,
        adapter: uniPos.adapter.address,
        tokenA: uniPos.adapter.tokenA,
        tokenB: uniPos.adapter.tokenB,
        positionTokenId: uniPos.tokenId,
        liquidity: halfLiq,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 500n,
        fullExit: false,
      },
      1001n,
    );
    const uniNpmPos = await ethers.getContractAt(
      [
        "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
        "function ownerOf(uint256) view returns (address)",
      ],
      uniPos.adapter.npm,
    );
    expect(await uniNpmPos.ownerOf(uniPos.tokenId)).to.equal(ctx.user.address);
    expect((await uniNpmPos.positions(uniPos.tokenId))[7]).to.equal(uniPos.liquidity - halfLiq);

    // Full exitLeg on Aerodrome current cbBTC/WETH (leg 2) — burns NFT
    const aeroCur = positions[2];
    await aeroCur.npm.connect(ctx.user).approve(aeroCur.adapter.address, aeroCur.tokenId);
    await ctx.clExecutor.connect(ctx.user).exitLeg(
      strategyId,
      {
        legIndex: 2,
        adapter: aeroCur.adapter.address,
        tokenA: aeroCur.adapter.tokenA,
        tokenB: aeroCur.adapter.tokenB,
        positionTokenId: aeroCur.tokenId,
        liquidity: 0n,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 500n,
        fullExit: true,
      },
      1002n,
    );
    await expect(aeroCur.npm.ownerOf(aeroCur.tokenId)).to.be.reverted;

    // Full exitLeg on Aerodrome legacy USDC/cbBTC (leg 0) — burns NFT
    const aeroLeg = positions[0];
    await aeroLeg.npm.connect(ctx.user).approve(aeroLeg.adapter.address, aeroLeg.tokenId);
    await ctx.clExecutor.connect(ctx.user).exitLeg(
      strategyId,
      {
        legIndex: 0,
        adapter: aeroLeg.adapter.address,
        tokenA: aeroLeg.adapter.tokenA,
        tokenB: aeroLeg.adapter.tokenB,
        positionTokenId: aeroLeg.tokenId,
        liquidity: 0n,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 500n,
        fullExit: true,
      },
      1000n,
    );
    await expect(aeroLeg.npm.ownerOf(aeroLeg.tokenId)).to.be.reverted;

    // Fresh deposit for exitAll + emergency + direct NPM
    const positions2 = await depositCollectingPositions(ctx, strategyId, 11n);

    const exitAllLegs = [];
    for (let i = 0; i < 4; i++) {
      const p = positions2[i];
      await p.npm.connect(ctx.user).approve(p.adapter.address, p.tokenId);
      exitAllLegs.push({
        legIndex: i,
        adapter: p.adapter.address,
        tokenA: p.adapter.tokenA,
        tokenB: p.adapter.tokenB,
        positionTokenId: p.tokenId,
        liquidity: 0n,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 500n,
        fullExit: true,
      });
    }
    // leave leg 4 for emergency + direct NPM coverage on remaining NFT
    exitAllLegs.push({
      legIndex: 4,
      adapter: ethers.ZeroAddress,
      tokenA: ethers.ZeroAddress,
      tokenB: ethers.ZeroAddress,
      positionTokenId: 0n,
      liquidity: 0n,
      amountAMin: 1n,
      amountBMin: 1n,
      slippageBps: 500n,
      fullExit: true,
    });
    await ctx.clExecutor.connect(ctx.user).exitAll(strategyId, exitAllLegs, 2000n);
    for (let i = 0; i < 4; i++) {
      await expect(positions2[i].npm.ownerOf(positions2[i].tokenId)).to.be.reverted;
    }

    // emergencyExitLeg on leg 4 after revoke — burns NFT
    const p4 = positions2[4];
    await ctx.strategyRegistry.connect(ctx.user).revokeStrategy(strategyId);
    const legBinding = await ctx.strategyRegistry.getLeg(strategyId, 4);
    await ctx.permissionRegistry.connect(ctx.user).revoke(legBinding.legPermissionId);
    await p4.npm.connect(ctx.user).approve(p4.adapter.address, p4.tokenId);
    await ctx.clExecutor.connect(ctx.user).emergencyExitLeg(
      strategyId,
      {
        legIndex: 4,
        adapter: p4.adapter.address,
        tokenA: p4.adapter.tokenA,
        tokenB: p4.adapter.tokenB,
        positionTokenId: p4.tokenId,
        liquidity: 0n,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 500n,
        fullExit: true,
      },
      3004n,
    );
    await expect(p4.npm.ownerOf(p4.tokenId)).to.be.reverted;

    // Direct NPM exit path: mint a tiny Uni position via adapter for user, then NPM decrease+collect+burn
    // without executor (wallet-owned NFT recovery).
    const [deployer] = await ethers.getSigners();
    const directSpec = ctx.adapters[1];
    const tick = await readPoolTick(directSpec.poolAddress);
    const pool = await ethers.getContractAt(POOL_ABI, directSpec.poolAddress);
    const spacing = Number(await pool.tickSpacing());
    const tickLower = alignTick(tick - spacing * 10, spacing);
    const tickUpper = alignTick(tick + spacing * 10, spacing);
    await pullFromPool(POOL_USDC_CBBTC_UNI, USDC, deployer.address, ethers.parseUnits("50", 6));
    await pullFromPool(POOL_USDC_CBBTC_UNI, CBBTC, deployer.address, ethers.parseUnits("0.0004", 8));
    const directAdapter = await deployAdapter(deployer, {
      ...directSpec,
      executor: deployer.address,
      poolId: ethers.id("DIRECT_NPM_EXIT_POOL"),
    });
    const usdcTok = await ethers.getContractAt(ERC20_ABI, USDC);
    const cbbtcTok = await ethers.getContractAt(ERC20_ABI, CBBTC);
    await usdcTok.connect(deployer).approve(await directAdapter.getAddress(), ethers.MaxUint256);
    await cbbtcTok.connect(deployer).approve(await directAdapter.getAddress(), ethers.MaxUint256);
    const mintTx = await directAdapter.mintPosition(
      ctx.user.address,
      USDC,
      CBBTC,
      tickLower,
      tickUpper,
      ethers.parseUnits("25", 6),
      ethers.parseUnits("0.0002", 8),
      0,
      0,
    );
    await mintTx.wait();
    const npm = await ethers.getContractAt(
      [
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
        "function approve(address to, uint256 tokenId)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
        "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params) returns (uint256 amount0,uint256 amount1)",
        "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max) params) returns (uint256 amount0,uint256 amount1)",
        "function burn(uint256 tokenId)",
      ],
      UNI_NPM,
    );
    const mintLogs = await npm.queryFilter(npm.filters.Transfer(ethers.ZeroAddress, ctx.user.address), -5);
    expect(mintLogs.length).to.be.greaterThan(0);
    const directTokenId = mintLogs[mintLogs.length - 1].args.tokenId;
    expect(await npm.ownerOf(directTokenId)).to.equal(ctx.user.address);
    const liq = (await npm.positions(directTokenId))[7];
    expect(liq).to.be.gt(0n);
    await npm.connect(ctx.user).decreaseLiquidity({
      tokenId: directTokenId,
      liquidity: liq,
      amount0Min: 0,
      amount1Min: 0,
      deadline: BigInt((await time.latest()) + 600),
    });
    await npm.connect(ctx.user).collect({
      tokenId: directTokenId,
      recipient: ctx.user.address,
      amount0Max: (1n << 128n) - 1n,
      amount1Max: (1n << 128n) - 1n,
    });
    await npm.connect(ctx.user).burn(directTokenId);
    await expect(npm.ownerOf(directTokenId)).to.be.reverted;
  });

  it("rejects wrong user, wrong adapter, and replayed strategy deposit nonce", async function () {
    const ctx = await deployForkStack();
    const { strategyId } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("1000", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    await approveUsdcViaPermit2(ctx.user, await ctx.clExecutor.getAddress(), grossUsdc);

    await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      42n,
      grossUsdc,
      POOL_IDS,
      BigInt((await time.latest()) + 3600),
      legs,
    );

    await approveUsdcViaPermit2(ctx.user, await ctx.clExecutor.getAddress(), grossUsdc);
    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        42n,
        grossUsdc,
        POOL_IDS,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "DepositNonceAlreadyUsed");

    const badLegs = await buildDepositLegs(ctx, grossUsdc);
    badLegs[0].adapter = ctx.adapters[1].address;
    await approveUsdcViaPermit2(ctx.user, await ctx.clExecutor.getAddress(), grossUsdc);
    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        43n,
        grossUsdc,
        POOL_IDS,
        BigInt((await time.latest()) + 3600),
        badLegs,
      ),
    ).to.be.reverted;

    const [, , stranger] = await ethers.getSigners();
    await expect(
      ctx.clExecutor.connect(stranger).depositFivePoolStrategy(
        strategyId,
        44n,
        grossUsdc,
        POOL_IDS,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.revertedWithCustomError(ctx.clExecutor, "StrategyUserMismatch");
  });
});
