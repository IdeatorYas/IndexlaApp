const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ALL_ACTIONS =
  (1n << 0n) | (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 6n) | (1n << 7n);

const STRATEGY_KIND = ethers.id("STABLE_CLUB_FIVE_POOL_V1");
const ROUTE_USDC_CBBTC = ethers.id("MOCK_USDC_CBBTC");
const ROUTE_USDC_WETH = ethers.id("MOCK_USDC_WETH");

const POOL_IDS = [
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL10"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_UNI_005"),
];

const POOL_CATALOGUE = [
  { poolId: POOL_IDS[0], protocol: "aerodrome-slipstream", tokenAKey: "usdc", tokenBKey: "cbbtc", dualSwap: false },
  { poolId: POOL_IDS[1], protocol: "uniswap-v3", tokenAKey: "usdc", tokenBKey: "cbbtc", dualSwap: false },
  { poolId: POOL_IDS[2], protocol: "aerodrome-slipstream", tokenAKey: "cbbtc", tokenBKey: "weth", dualSwap: true },
  { poolId: POOL_IDS[3], protocol: "aerodrome-slipstream", tokenAKey: "cbbtc", tokenBKey: "weth", dualSwap: true },
  { poolId: POOL_IDS[4], protocol: "uniswap-v3", tokenAKey: "cbbtc", tokenBKey: "weth", dualSwap: true },
];

async function deployPhase2aStack() {
  const [deployer, user, feeRecipient] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

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

  const clExecutorAddr = await clExecutor.getAddress();
  const strategyRegistryAddr = await strategyRegistry.getAddress();

  await permissionRegistry.setStrategyRegistrar(strategyRegistryAddr, true);
  await permissionRegistry.setOperator(clExecutorAddr, true);
  await permissionRegistry.setOperator(strategyRegistryAddr, true);
  await strategyRegistry.setOperator(clExecutorAddr, true);
  await feeRouter.setExecutorApproved(clExecutorAddr, true);
  await swapRouter.setExecutorApproved(clExecutorAddr, true);

  for (const token of [tokens.usdc, tokens.cbbtc, tokens.weth]) {
    await clExecutor.setTokenApproval(token, true);
  }

  const routeUsdcCbbtc = {
    kind: 0,
    router: deployer.address,
    factory: deployer.address,
    pool: deployer.address,
    tokenIn: tokens.usdc,
    tokenOut: tokens.cbbtc,
    feeOrTickSpacing: 500,
    enabled: true,
  };
  const routeUsdcWeth = {
    kind: 0,
    router: deployer.address,
    factory: deployer.address,
    pool: deployer.address,
    tokenIn: tokens.usdc,
    tokenOut: tokens.weth,
    feeOrTickSpacing: 500,
    enabled: true,
  };
  await swapRouter.configureRoute(ROUTE_USDC_CBBTC, routeUsdcCbbtc);
  await swapRouter.configureRoute(ROUTE_USDC_WETH, routeUsdcWeth);

  const sampleNet = (ethers.parseUnits("100", 6) * 9900n) / 10000n;
  const expectedCb = await oracleGuard.expectedAmountOut(tokens.usdc, tokens.cbbtc, sampleNet, 6, 8);
  const expectedWe = await oracleGuard.expectedAmountOut(tokens.usdc, tokens.weth, sampleNet, 6, 18);
  const rateCb = (expectedCb * 10n ** 18n) / sampleNet;
  const rateWe = (expectedWe * 10n ** 18n) / sampleNet;
  await swapRouter.setRate(ROUTE_USDC_CBBTC, rateCb);
  await swapRouter.setRate(ROUTE_USDC_WETH, rateWe);

  await cbbtc.mint(await swapRouter.getAddress(), ethers.parseUnits("1000000", 8));
  await weth.mint(await swapRouter.getAddress(), ethers.parseUnits("1000000", 18));

  const adapters = [];
  for (const entry of POOL_CATALOGUE) {
    const adapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      clExecutorAddr,
      entry.poolId,
      entry.protocol,
    ]);
    const adapterAddr = await adapter.getAddress();
    await clExecutor.setAdapterApproval(adapterAddr, true);
    await clExecutor.registerPool(entry.poolId, adapterAddr);
    adapters.push({
      ...entry,
      contract: adapter,
      address: adapterAddr,
      tokenA: tokens[entry.tokenAKey],
      tokenB: tokens[entry.tokenBKey],
    });
  }

  await usdc.mint(user.address, ethers.parseUnits("1000000", 6));

  return {
    deployer,
    user,
    feeRecipient,
    chainId,
    permissionRegistry,
    strategyRegistry,
    feeRouter,
    swapRouter,
    oracleGuard,
    mevGuard,
    clExecutor,
    usdc,
    cbbtc,
    weth,
    tokens,
    adapters,
  };
}

async function buildStrategyPermission(ctx, overrides = {}) {
  return {
    user: ctx.user.address,
    chainId: ctx.chainId,
    depositToken: ctx.tokens.usdc,
    allowedActions: ALL_ACTIONS,
    maxTotalPerTx: ethers.parseUnits("10000", 6),
    maxTotalPerDay: ethers.parseUnits("50000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt: BigInt((await time.latest()) + 86400 * 7),
    revoked: false,
    paused: false,
    ...overrides,
  };
}

async function buildFivePoolRegistration(ctx, legOverrides = []) {
  const strategy = await buildStrategyPermission(ctx);
  const legPermissions = [];
  const legs = [];

  for (let i = 0; i < 5; i++) {
    const adapter = ctx.adapters[i];
    const override = legOverrides[i] || {};
    const legPerm = {
      user: ctx.user.address,
      chainId: ctx.chainId,
      poolId: adapter.poolId,
      tokenA: adapter.tokenA,
      tokenB: adapter.tokenB,
      allowedActions: ALL_ACTIONS,
      maxAmountPerTx: ethers.parseUnits("2000", 6),
      maxAmountPerDay: ethers.parseUnits("10000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 50n,
      expiresAt: strategy.expiresAt,
      revoked: false,
      paused: false,
      ...override.legPerm,
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
      poolId: adapter.poolId,
      allocationBps: 2000n,
      adapter: adapter.address,
      tokenA: adapter.tokenA,
      tokenB: adapter.tokenB,
      legPermissionId,
      maxLegPerTx: ethers.parseUnits("2000", 6),
      maxLegPerDay: ethers.parseUnits("10000", 6),
      ...override.leg,
    });
  }

  return { strategy, legPermissions, legs };
}

async function registerFivePoolStrategy(ctx, legOverrides = []) {
  const { strategy, legPermissions, legs } = await buildFivePoolRegistration(ctx, legOverrides);
  await ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs);
  const strategyId = await ctx.strategyRegistry.strategyIdFor(strategy.user, strategy.chainId, strategy.depositToken);
  return { strategy, legs, strategyId, poolIds: POOL_IDS };
}

async function oracleQuote(ctx, tokenOut, grossUsdc) {
  const expected = await ctx.oracleGuard.expectedAmountOut(
    ctx.tokens.usdc,
    tokenOut,
    grossUsdc,
    6,
    tokenOut === ctx.tokens.weth ? 18 : 8,
  );
  const minOut = (expected * 9900n) / 10000n;
  return { expected, minOut };
}

async function buildDepositLegs(ctx, grossUsdc = ethers.parseUnits("1000", 6)) {
  const legBudget = grossUsdc / 5n;
  const half = legBudget / 2n;
  const netHalf = (half * 9900n) / 10000n;
  const deadline = BigInt((await time.latest()) + 3600);
  const slippageBps = 500n;
  const legs = [];

  for (let i = 0; i < 5; i++) {
    const adapter = ctx.adapters[i];
    const entry = POOL_CATALOGUE[i];
    const emptySwap = {
      routeId: ethers.ZeroHash,
      grossUsdcIn: 0n,
      minOut: 0n,
      quotedOut: 0n,
      deadline: 0n,
    };

    if (!entry.dualSwap) {
      const q = await oracleQuote(ctx, ctx.tokens.cbbtc, netHalf);
      legs.push({
        legIndex: i,
        adapter: adapter.address,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        tickLower: -100000,
        tickUpper: -90000,
        retainUsdc: half,
        swaps: [
          {
            routeId: ROUTE_USDC_CBBTC,
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
      const qCb = await oracleQuote(ctx, ctx.tokens.cbbtc, netHalf);
      const qWe = await oracleQuote(ctx, ctx.tokens.weth, netHalf);
      legs.push({
        legIndex: i,
        adapter: adapter.address,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        tickLower: -100000,
        tickUpper: -90000,
        retainUsdc: 0n,
        swaps: [
          {
            routeId: ROUTE_USDC_CBBTC,
            grossUsdcIn: half,
            minOut: qCb.minOut,
            quotedOut: qCb.expected,
            deadline,
          },
          {
            routeId: ROUTE_USDC_WETH,
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

async function approveUsdcDeposit(ctx, user, grossUsdc) {
  await ctx.usdc.connect(user).approve(await ctx.clExecutor.getAddress(), grossUsdc);
}

describe("Phase 2a — StrategyPermissionRegistry allocation", function () {
  it("rejects leg allocation not exactly 2000 bps", async function () {
    const ctx = await deployPhase2aStack();
    const { strategy, legPermissions, legs } = await buildFivePoolRegistration(ctx);
    legs[2].allocationBps = 3000n;
    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "InvalidLegAllocation");
  });

  it("rejects non-USDC deposit token", async function () {
    const ctx = await deployPhase2aStack();
    const { strategy, legPermissions, legs } = await buildFivePoolRegistration(ctx);
    strategy.depositToken = ctx.tokens.cbbtc;
    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "InvalidDepositToken");
  });
});

describe("Phase 2a — FeeRouter multi-executor allowlist", function () {
  it("applySwapFeeOnHeld charges 1% from executor balance", async function () {
    const ctx = await deployPhase2aStack();
    const gross = ethers.parseUnits("100", 6);
    await ctx.usdc.mint(await ctx.clExecutor.getAddress(), gross);
    const clSigner = await ethers.getSigner(await ctx.clExecutor.getAddress());
    await ethers.provider.send("hardhat_impersonateAccount", [await ctx.clExecutor.getAddress()]);
    await ethers.provider.send("hardhat_setBalance", [await ctx.clExecutor.getAddress(), "0x56BC75E2D63100000"]);
    await ctx.usdc.connect(clSigner).approve(await ctx.feeRouter.getAddress(), gross);
    const tx = await ctx.feeRouter.connect(clSigner).applySwapFeeOnHeld(
      ctx.tokens.usdc,
      ctx.user.address,
      gross,
      ethers.ZeroHash,
    );
    await tx.wait();
    expect(await ctx.usdc.balanceOf(ctx.feeRecipient.address)).to.equal(ethers.parseUnits("1", 6));
    expect(await ctx.usdc.balanceOf(await ctx.clExecutor.getAddress())).to.equal(ethers.parseUnits("99", 6));
  });
});

describe("Phase 2a — five-pool CL executor deposit and exit", function () {
  it("depositFivePoolStrategy pulls USDC only, performs 8 swaps, mints 5 NFTs", async function () {
    const ctx = await deployPhase2aStack();
    const { strategyId, poolIds } = await registerFivePoolStrategy(ctx);
    const grossUsdc = ethers.parseUnits("1000", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    await approveUsdcDeposit(ctx, ctx.user, grossUsdc);

    const userUsdcBefore = await ctx.usdc.balanceOf(ctx.user.address);
    const tx = await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      1n,
      grossUsdc,
      poolIds,
      BigInt((await time.latest()) + 3600),
      legs,
    );
    const receipt = await tx.wait();

    expect(await ctx.usdc.balanceOf(ctx.user.address)).to.equal(userUsdcBefore - grossUsdc);
    for (const adapter of ctx.adapters) {
      expect(await adapter.contract.balanceOf(ctx.user.address)).to.equal(1n);
    }
    expect(await ctx.usdc.balanceOf(await ctx.clExecutor.getAddress())).to.equal(0n);
    expect(await ctx.cbbtc.balanceOf(await ctx.clExecutor.getAddress())).to.equal(0n);
    expect(await ctx.weth.balanceOf(await ctx.clExecutor.getAddress())).to.equal(0n);

    const feeEvents = receipt.logs.filter((log) => {
      try {
        return ctx.feeRouter.interface.parseLog(log)?.name === "SwapFeeCharged";
      } catch {
        return false;
      }
    });
    expect(feeEvents.length).to.equal(8);
  });

  it("reverts entire deposit on leg failure (atomic)", async function () {
    const ctx = await deployPhase2aStack();
    const { strategyId, poolIds } = await registerFivePoolStrategy(ctx);
    const grossUsdc = ethers.parseUnits("200", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    legs[3].adapter = ctx.adapters[0].address;
    await approveUsdcDeposit(ctx, ctx.user, grossUsdc);

    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        2n,
        grossUsdc,
        poolIds,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.reverted;

    for (const adapter of ctx.adapters) {
      expect(await adapter.contract.balanceOf(ctx.user.address)).to.equal(0n);
    }
    expect(await ctx.strategyRegistry.strategyDepositNonceUsed(strategyId, 2n)).to.equal(false);
  });

  it("exitLeg and exitAll", async function () {
    const ctx = await deployPhase2aStack();
    const { strategyId, poolIds } = await registerFivePoolStrategy(ctx);
    const grossUsdc = ethers.parseUnits("500", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    await approveUsdcDeposit(ctx, ctx.user, grossUsdc);
    await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      3n,
      grossUsdc,
      poolIds,
      BigInt((await time.latest()) + 3600),
      legs,
    );

    const adapter1 = ctx.adapters[1];
    const tokenId1 = 1n;
    await adapter1.contract.connect(ctx.user).approve(adapter1.address, tokenId1);
    await ctx.clExecutor.connect(ctx.user).exitLeg(
      strategyId,
      {
        legIndex: 1,
        adapter: adapter1.address,
        tokenA: adapter1.tokenA,
        tokenB: adapter1.tokenB,
        positionTokenId: tokenId1,
        liquidity: 1n,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 100n,
      },
      301n,
    );

    const exitAllLegs = [];
    for (let i = 0; i < 5; i++) {
      const adapter = ctx.adapters[i];
      const tokenId = 1n;
      await adapter.contract.connect(ctx.user).approve(adapter.address, tokenId);
      exitAllLegs.push({
        legIndex: i,
        adapter: adapter.address,
        tokenA: adapter.tokenA,
        tokenB: adapter.tokenB,
        positionTokenId: tokenId,
        liquidity: 1n,
        amountAMin: 1n,
        amountBMin: 1n,
        slippageBps: 100n,
      });
    }
    await ctx.clExecutor.connect(ctx.user).exitAll(strategyId, exitAllLegs, 500n);
  });
});
