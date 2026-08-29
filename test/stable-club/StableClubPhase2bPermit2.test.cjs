const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ALL_ACTIONS =
  (1n << 0n) | (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 6n) | (1n << 7n);

const STRATEGY_KIND = ethers.id("STABLE_CLUB_FIVE_POOL_V1");
const ROUTE_USDC_CBBTC = ethers.id("MOCK_USDC_CBBTC");
const ROUTE_USDC_WETH = ethers.id("MOCK_USDC_WETH");
const BASE_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

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

async function deployClPermit2Stack() {
  const [deployer, user, feeRecipient, stranger] = await ethers.getSigners();
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
    const addr = await adapter.getAddress();
    await clExecutor.setAdapterApproval(addr, true);
    await clExecutor.registerPool(entry.poolId, addr);
    adapters.push({
      ...entry,
      address: addr,
      contract: adapter,
      tokenA: tokens[entry.tokenAKey],
      tokenB: tokens[entry.tokenBKey],
    });
  }

  await usdc.mint(user.address, ethers.parseUnits("100000", 6));

  return {
    deployer,
    user,
    stranger,
    feeRecipient,
    chainId,
    usdc,
    tokens,
    permit2,
    oracleGuard,
    permissionRegistry,
    strategyRegistry,
    feeRouter,
    swapRouter,
    clExecutor,
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
    maxTotalPerTx: ethers.parseUnits("100000", 6),
    maxTotalPerDay: ethers.parseUnits("500000", 6),
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
      maxAmountPerTx: ethers.parseUnits("50000", 6),
      maxAmountPerDay: ethers.parseUnits("200000", 6),
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
      maxLegPerTx: ethers.parseUnits("50000", 6),
      maxLegPerDay: ethers.parseUnits("200000", 6),
    });
  }
  await ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs);
  const strategyId = await ctx.strategyRegistry.strategyIdFor(
    ctx.user.address,
    ctx.chainId,
    ctx.tokens.usdc,
  );
  return { strategyId, poolIds: POOL_IDS };
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

async function buildDepositLegs(ctx, grossUsdc) {
  const legBudget = grossUsdc / 5n;
  const half = legBudget / 2n;
  const netHalf = (half * 9900n) / 10000n;
  const deadline = BigInt((await time.latest()) + 3600);
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
    if (!a.dualSwap) {
      const q = await oracleQuote(ctx, ctx.tokens.cbbtc, netHalf);
      legs.push({
        legIndex: i,
        adapter: a.address,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
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
        slippageBps: 500n,
      });
    } else {
      const qCb = await oracleQuote(ctx, ctx.tokens.cbbtc, netHalf);
      const qWe = await oracleQuote(ctx, ctx.tokens.weth, netHalf);
      legs.push({
        legIndex: i,
        adapter: a.address,
        tokenA: a.tokenA,
        tokenB: a.tokenB,
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
        slippageBps: 500n,
      });
    }
  }
  return legs;
}

async function approveBounded(ctx, amount, opts = {}) {
  const spender = opts.spender ?? (await ctx.clExecutor.getAddress());
  const expiration = opts.expiration ?? BigInt((await time.latest()) + 3600);
  await ctx.usdc.connect(ctx.user).approve(await ctx.permit2.getAddress(), amount);
  if (opts.skipPermit2Approve) return expiration;
  await ctx.permit2.connect(ctx.user).approve(ctx.tokens.usdc, spender, amount, expiration);
  return expiration;
}

describe("Phase 2b — Permit2 CL deposit adversarial", function () {
  it("succeeds with bounded Permit2 allowance to CL executor only", async function () {
    const ctx = await deployClPermit2Stack();
    const { strategyId, poolIds } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("500", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    await approveBounded(ctx, grossUsdc);

    await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      1n,
      grossUsdc,
      poolIds,
      BigInt((await time.latest()) + 3600),
      legs,
    );
    const [remaining] = await ctx.permit2.allowance(
      ctx.user.address,
      ctx.tokens.usdc,
      await ctx.clExecutor.getAddress(),
    );
    expect(remaining).to.equal(0n);
  });

  it("reverts on expired Permit2 allowance", async function () {
    const ctx = await deployClPermit2Stack();
    const { strategyId, poolIds } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("100", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    const shortExp = BigInt((await time.latest()) + 10);
    await approveBounded(ctx, grossUsdc, { expiration: shortExp });
    await time.increase(20);
    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        2n,
        grossUsdc,
        poolIds,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.revertedWithCustomError(ctx.permit2, "AllowanceExpired");
  });

  it("reverts when Permit2 spender is wrong (stranger / FeeRouter)", async function () {
    const ctx = await deployClPermit2Stack();
    const { strategyId, poolIds } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("100", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    const clAddr = await ctx.clExecutor.getAddress();
    const farExp = BigInt((await time.latest()) + 3600);

    // Zero CL-executor allowance with non-expired slot → InsufficientAllowance (not AllowanceExpired)
    await ctx.usdc.connect(ctx.user).approve(await ctx.permit2.getAddress(), grossUsdc * 2n);
    await ctx.permit2.connect(ctx.user).approve(ctx.tokens.usdc, clAddr, 0, farExp);
    await ctx.permit2
      .connect(ctx.user)
      .approve(ctx.tokens.usdc, await ctx.feeRouter.getAddress(), grossUsdc, farExp);
    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        3n,
        grossUsdc,
        poolIds,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.revertedWithCustomError(ctx.permit2, "InsufficientAllowance");

    await ctx.permit2.connect(ctx.user).approve(ctx.tokens.usdc, ctx.stranger.address, grossUsdc, farExp);
    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        4n,
        grossUsdc,
        poolIds,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.revertedWithCustomError(ctx.permit2, "InsufficientAllowance");
  });

  it("reverts on insufficient Permit2 amount", async function () {
    const ctx = await deployClPermit2Stack();
    const { strategyId, poolIds } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("100", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    await approveBounded(ctx, grossUsdc - 1n);
    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        5n,
        grossUsdc,
        poolIds,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.revertedWithCustomError(ctx.permit2, "InsufficientAllowance");
  });

  it("rejects unlimited Permit2 allowance at MockPermit2", async function () {
    const ctx = await deployClPermit2Stack();
    const max = (1n << 160n) - 1n;
    await expect(
      ctx.permit2
        .connect(ctx.user)
        .approve(ctx.tokens.usdc, await ctx.clExecutor.getAddress(), max, (await time.latest()) + 100),
    ).to.be.revertedWithCustomError(ctx.permit2, "UnlimitedAllowanceForbidden");
  });

  it("replay: second deposit without re-approval fails after allowance consumed", async function () {
    const ctx = await deployClPermit2Stack();
    const { strategyId, poolIds } = await registerStrategy(ctx);
    const grossUsdc = ethers.parseUnits("100", 6);
    const legs = await buildDepositLegs(ctx, grossUsdc);
    // Approve once for 2x so ERC20 side is fine; Permit2 only for one deposit
    await ctx.usdc.connect(ctx.user).approve(await ctx.permit2.getAddress(), grossUsdc * 2n);
    await ctx.permit2
      .connect(ctx.user)
      .approve(
        ctx.tokens.usdc,
        await ctx.clExecutor.getAddress(),
        grossUsdc,
        BigInt((await time.latest()) + 3600),
      );

    await ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
      strategyId,
      10n,
      grossUsdc,
      poolIds,
      BigInt((await time.latest()) + 3600),
      legs,
    );

    await expect(
      ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
        strategyId,
        11n,
        grossUsdc,
        poolIds,
        BigInt((await time.latest()) + 3600),
        legs,
      ),
    ).to.be.revertedWithCustomError(ctx.permit2, "InsufficientAllowance");
  });

  it("wrong-chain: strategy registration rejects mismatched chainId", async function () {
    const ctx = await deployClPermit2Stack();
    const expiresAt = BigInt((await time.latest()) + 86400);
    const strategy = {
      user: ctx.user.address,
      chainId: ctx.chainId + 1n,
      depositToken: ctx.tokens.usdc,
      allowedActions: ALL_ACTIONS,
      maxTotalPerTx: ethers.parseUnits("1000", 6),
      maxTotalPerDay: ethers.parseUnits("5000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 10n,
      expiresAt,
      revoked: false,
      paused: false,
    };
    const a = ctx.adapters[0];
    const legPerm = {
      user: ctx.user.address,
      chainId: ctx.chainId + 1n,
      poolId: a.poolId,
      tokenA: a.tokenA,
      tokenB: a.tokenB,
      allowedActions: ALL_ACTIONS,
      maxAmountPerTx: ethers.parseUnits("1000", 6),
      maxAmountPerDay: ethers.parseUnits("5000", 6),
      maxSlippageBps: 500n,
      minTimeBetweenExecutions: 0n,
      maxExecutionsPerDay: 10n,
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
    const legPermissions = Array(5).fill(legPerm);
    const legs = Array(5)
      .fill(null)
      .map((_, i) => ({
        poolId: ctx.adapters[i].poolId,
        allocationBps: 2000n,
        adapter: ctx.adapters[i].address,
        tokenA: ctx.adapters[i].tokenA,
        tokenB: ctx.adapters[i].tokenB,
        legPermissionId,
        maxLegPerTx: ethers.parseUnits("1000", 6),
        maxLegPerDay: ethers.parseUnits("5000", 6),
      }));
    // Fix per-leg ids
    for (let i = 0; i < 5; i++) {
      const lp = { ...legPerm, poolId: ctx.adapters[i].poolId, tokenA: ctx.adapters[i].tokenA, tokenB: ctx.adapters[i].tokenB };
      legPermissions[i] = lp;
      legs[i].legPermissionId = await ctx.permissionRegistry.permissionIdFor(
        lp.user,
        lp.chainId,
        lp.poolId,
        lp.tokenA,
        lp.tokenB,
      );
      legs[i].poolId = ctx.adapters[i].poolId;
      legs[i].adapter = ctx.adapters[i].address;
      legs[i].tokenA = ctx.adapters[i].tokenA;
      legs[i].tokenB = ctx.adapters[i].tokenB;
    }

    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "UnauthorizedUser");
  });
});

describe("Phase 2b — Base fork Permit2 address evidence", function () {
  this.timeout(120_000);

  it("canonical Base Permit2 has live bytecode and DOMAIN_SEPARATOR", async function () {
    if (!process.env.BASE_RPC_URL?.trim()) this.skip();
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: process.env.BASE_RPC_URL } }],
    });
    // Hardhat/EDR on Base: mine once so eth_call is not on the raw historical fork tip.
    await network.provider.send("evm_mine", []);
    const code = await ethers.provider.getCode(BASE_PERMIT2);
    expect((code.length - 2) / 2).to.be.gt(1000);
    const permit2 = await ethers.getContractAt(
      ["function DOMAIN_SEPARATOR() view returns (bytes32)"],
      BASE_PERMIT2,
    );
    const sep = await permit2.DOMAIN_SEPARATOR();
    expect(sep).to.not.equal(ethers.ZeroHash);
    // eslint-disable-next-line no-console
    console.log(`\n[Phase2bPermit2Fork] Permit2=${BASE_PERMIT2} DOMAIN_SEPARATOR=${sep}\n`);
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });
});
