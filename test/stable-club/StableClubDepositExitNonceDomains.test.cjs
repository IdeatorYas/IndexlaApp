/**
 * SC-10 — deposit vs exit permission-nonce domains must be disjoint.
 */
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

async function deployStack() {
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
  const safetyController = await ethers.deployContract("SafetyController");

  const clExecutor = await ethers.deployContract("StableClubConcentratedLiquidityExecutor", [
    await permissionRegistry.getAddress(),
    await strategyRegistry.getAddress(),
    await feeRouter.getAddress(),
    await swapRouter.getAddress(),
    await mevGuard.getAddress(),
    await oracleGuard.getAddress(),
    await safetyController.getAddress(),
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

  const permit2 = await ethers.deployContract("MockPermit2");
  await clExecutor.setPermit2(await permit2.getAddress());
  for (const token of [tokens.usdc, tokens.cbbtc, tokens.weth]) {
    await clExecutor.setTokenApproval(token, true);
  }

  await swapRouter.configureRoute(ROUTE_USDC_CBBTC, {
    kind: 0,
    router: deployer.address,
    factory: deployer.address,
    pool: deployer.address,
    tokenIn: tokens.usdc,
    tokenOut: tokens.cbbtc,
    feeOrTickSpacing: 500,
    enabled: true,
  });
  await swapRouter.configureRoute(ROUTE_USDC_WETH, {
    kind: 0,
    router: deployer.address,
    factory: deployer.address,
    pool: deployer.address,
    tokenIn: tokens.usdc,
    tokenOut: tokens.weth,
    feeOrTickSpacing: 500,
    enabled: true,
  });

  const sampleNet = (ethers.parseUnits("100", 6) * 9900n) / 10000n;
  const expectedCb = await oracleGuard.expectedAmountOut(tokens.usdc, tokens.cbbtc, sampleNet, 6, 8);
  const expectedWe = await oracleGuard.expectedAmountOut(tokens.usdc, tokens.weth, sampleNet, 6, 18);
  await swapRouter.setRate(ROUTE_USDC_CBBTC, (expectedCb * 10n ** 18n) / sampleNet);
  await swapRouter.setRate(ROUTE_USDC_WETH, (expectedWe * 10n ** 18n) / sampleNet);
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
    chainId,
    permissionRegistry,
    strategyRegistry,
    feeRouter,
    swapRouter,
    permit2,
    oracleGuard,
    clExecutor,
    usdc,
    cbbtc,
    weth,
    tokens,
    adapters,
  };
}

async function registerStrategy(ctx) {
  const expiresAt = BigInt((await time.latest()) + 86400 * 7);
  const strategy = {
    user: ctx.user.address,
    chainId: ctx.chainId,
    depositToken: ctx.tokens.usdc,
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
    const adapter = ctx.adapters[i];
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
      poolId: adapter.poolId,
      allocationBps: 2000n,
      adapter: adapter.address,
      tokenA: adapter.tokenA,
      tokenB: adapter.tokenB,
      legPermissionId,
      maxLegPerTx: ethers.parseUnits("2000", 6),
      maxLegPerDay: ethers.parseUnits("10000", 6),
    });
  }
  await ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs);
  const strategyId = await ctx.strategyRegistry.strategyIdFor(
    ctx.user.address,
    ctx.chainId,
    ctx.tokens.usdc,
  );
  return { strategyId, poolIds: POOL_IDS, legPermissionIds: legs.map((l) => l.legPermissionId) };
}

async function oracleQuote(ctx, tokenOut, grossUsdc) {
  const expected = await ctx.oracleGuard.expectedAmountOut(
    ctx.tokens.usdc,
    tokenOut,
    grossUsdc,
    6,
    tokenOut === ctx.tokens.weth ? 18 : 8,
  );
  return { expected, minOut: (expected * 9900n) / 10000n };
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

async function approveUsdc(ctx, amount) {
  const permit2Addr = await ctx.permit2.getAddress();
  const clAddr = await ctx.clExecutor.getAddress();
  await ctx.usdc.connect(ctx.user).approve(permit2Addr, amount);
  await ctx.permit2
    .connect(ctx.user)
    .approve(ctx.tokens.usdc, clAddr, amount, BigInt((await time.latest()) + 3600));
}

function exitParams(adapter, legIndex, tokenId, amountAMin, amountBMin) {
  return {
    legIndex,
    adapter: adapter.address,
    tokenA: adapter.tokenA,
    tokenB: adapter.tokenB,
    positionTokenId: tokenId,
    liquidity: 0n,
    amountAMin,
    amountBMin,
    slippageBps: 100n,
    fullExit: true,
  };
}

describe("SC-10 — domain-separate deposit and exit nonces", function () {
  it("five deposit-leg nonces are unique", async function () {
    const ctx = await deployStack();
    const domain = await ctx.clExecutor.EXIT_EXECUTION_NONCE_DOMAIN();
    const strategyNonce = 7n;
    const set = new Set();
    for (let i = 0; i < 5; i++) {
      const n = await ctx.clExecutor.encodeDepositLegExecutionNonce(strategyNonce, i);
      expect(n).to.equal(strategyNonce * 10n + BigInt(i));
      expect(n < domain).to.equal(true);
      set.add(n.toString());
    }
    expect(set.size).to.equal(5);
  });

  it("deposit nonce can never equal exit nonce for the same input", async function () {
    const ctx = await deployStack();
    for (const n of [0n, 1n, 10n, 15n, 100n, 999n]) {
      for (let i = 0; i < 5; i++) {
        const deposit = await ctx.clExecutor.encodeDepositLegExecutionNonce(n, i);
        const exitN = await ctx.clExecutor.encodeExitExecutionNonce(n);
        const exitAll = await ctx.clExecutor.encodeExitAllLegExecutionNonce(n, i);
        expect(deposit).to.not.equal(exitN);
        expect(deposit).to.not.equal(exitAll);
        expect(exitN).to.equal((1n << 255n) | n);
      }
    }
  });

  it("different strategy nonces remain unique", async function () {
    const ctx = await deployStack();
    const a = [];
    const b = [];
    for (let i = 0; i < 5; i++) {
      a.push(await ctx.clExecutor.encodeDepositLegExecutionNonce(1n, i));
      b.push(await ctx.clExecutor.encodeDepositLegExecutionNonce(2n, i));
    }
    for (const x of a) {
      for (const y of b) {
        expect(x).to.not.equal(y);
      }
    }
  });

  it("invalid domain/overflow input fails before nonce consumption", async function () {
    const ctx = await deployStack();
    const domain = await ctx.clExecutor.EXIT_EXECUTION_NONCE_DOMAIN();
    await expect(ctx.clExecutor.encodeExitExecutionNonce(domain)).to.be.revertedWithCustomError(
      ctx.clExecutor,
      "InvalidExecutionNonce",
    );
    await expect(
      ctx.clExecutor.encodeDepositLegExecutionNonce(ethers.MaxUint256, 0),
    ).to.be.revertedWithCustomError(ctx.clExecutor, "InvalidExecutionNonce");

    const { strategyId, poolIds, legPermissionIds } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("500", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    await approveUsdc(ctx, grossUsdc);

    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        ethers.MaxUint256,
        grossUsdc,
        poolIds,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.revertedWithCustomError(ctx.clExecutor, "InvalidExecutionNonce");

    expect(await ctx.strategyRegistry.strategyDepositNonceUsed(strategyId, ethers.MaxUint256)).to.equal(
      false,
    );
    for (const pid of legPermissionIds) {
      expect(await ctx.permissionRegistry.executionNonceUsed(pid, 0n)).to.equal(false);
    }
  });

  it("normal/emergency exit replay revert; deposit and exit happy paths remain valid", async function () {
    const ctx = await deployStack();
    const { strategyId, poolIds, legPermissionIds } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("500", 6);
    await approveUsdc(ctx, grossUsdc);

    await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      1n,
      grossUsdc,
      poolIds,
      BigInt((await time.latest()) + 3600),
      await buildDepositLegs(ctx, grossUsdc),
    );

    for (let i = 0; i < 5; i++) {
      const derived = await ctx.clExecutor.encodeDepositLegExecutionNonce(1n, i);
      expect(await ctx.permissionRegistry.executionNonceUsed(legPermissionIds[i], derived)).to.equal(
        true,
      );
      expect(await ctx.clExecutor.encodeExitExecutionNonce(derived)).to.not.equal(derived);
    }

    const adapter0 = ctx.adapters[0];
    await adapter0.contract.connect(ctx.user).approve(adapter0.address, 1n);
    const normalNonce = 100n;
    await ctx.clExecutor
      .connect(ctx.user)
      .exitLeg(strategyId, exitParams(adapter0, 0, 1n, 1n, 1n), normalNonce);

    const encodedNormal = await ctx.clExecutor.encodeExitExecutionNonce(normalNonce);
    expect(
      await ctx.permissionRegistry.executionNonceUsed(legPermissionIds[0], encodedNormal),
    ).to.equal(true);

    // Second deposit for a fresh NFT on leg 1, then exit + replay.
    await approveUsdc(ctx, grossUsdc);
    await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      2n,
      grossUsdc,
      poolIds,
      BigInt((await time.latest()) + 3600),
      await buildDepositLegs(ctx, grossUsdc),
    );

    const adapter1 = ctx.adapters[1];
    await adapter1.contract.connect(ctx.user).approve(adapter1.address, 1n);
    await ctx.clExecutor
      .connect(ctx.user)
      .exitLeg(strategyId, exitParams(adapter1, 1, 1n, 1n, 1n), normalNonce);

    await approveUsdc(ctx, grossUsdc);
    await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      3n,
      grossUsdc,
      poolIds,
      BigInt((await time.latest()) + 3600),
      await buildDepositLegs(ctx, grossUsdc),
    );
    await adapter1.contract.connect(ctx.user).approve(adapter1.address, 2n);
    await expect(
      ctx.clExecutor
        .connect(ctx.user)
        .exitLeg(strategyId, exitParams(adapter1, 1, 2n, 1n, 1n), normalNonce),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ExecutionNonceAlreadyUsed");

    const adapter2 = ctx.adapters[2];
    await adapter2.contract.connect(ctx.user).approve(adapter2.address, 1n);
    const emergencyNonce = 301n;
    await ctx.clExecutor
      .connect(ctx.user)
      .emergencyExitLeg(strategyId, exitParams(adapter2, 2, 1n, 1n, 1n), emergencyNonce);

    await approveUsdc(ctx, grossUsdc);
    await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      4n,
      grossUsdc,
      poolIds,
      BigInt((await time.latest()) + 3600),
      await buildDepositLegs(ctx, grossUsdc),
    );
    await adapter2.contract.connect(ctx.user).approve(adapter2.address, 2n);
    await expect(
      ctx.clExecutor
        .connect(ctx.user)
        .emergencyExitLeg(strategyId, exitParams(adapter2, 2, 2n, 1n, 1n), emergencyNonce),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ExecutionNonceAlreadyUsed");
  });
});
