/**
 * SC-07 / operation-path permission enforcement — real executor call sites only.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployClExecutor } = require("../../scripts/stable-club/deploy-cl-executor.cjs");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { activateStep2PoolWithGovernance } = require("../../scripts/stable-club/governance-activation-local.cjs");

const ALL_ACTIONS =
  (1n << 0n) | (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 6n) | (1n << 7n);
const DEPOSIT_BIT = 1n << 0n;
const WITHDRAW_ALL_BIT = 1n << 4n;
const HARVEST_BIT = 1n << 8n;
const COMPOUND_BIT = 1n << 9n;

const STRATEGY_KIND = ethers.id("STABLE_CLUB_FIVE_POOL_V1");
const ROUTE_USDC_CBBTC = ethers.id("MOCK_USDC_CBBTC");
const ROUTE_USDC_WETH = ethers.id("MOCK_USDC_WETH");
const STEP2_POOL = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

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

async function deployClStack() {
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

  const clExecutor = await deployClExecutor(ethers, [
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
    user,
    chainId,
    permissionRegistry,
    strategyRegistry,
    clExecutor,
    permit2,
    oracleGuard,
    usdc,
    cbbtc,
    weth,
    tokens,
    adapters,
  };
}

async function registerStrategy(ctx, overrides = {}) {
  const expiresAt = BigInt((await time.latest()) + 86400 * 7);
  const strategyMaxTx = overrides.strategy?.maxTotalPerTx ?? ethers.parseUnits("10000", 6);
  const strategy = {
    user: ctx.user.address,
    chainId: ctx.chainId,
    depositToken: ctx.tokens.usdc,
    allowedActions: ALL_ACTIONS,
    maxTotalPerTx: strategyMaxTx,
    maxTotalPerDay: ethers.parseUnits("50000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt,
    revoked: false,
    paused: false,
    ...overrides.strategy,
  };
  const legPermissions = [];
  const legs = [];
  for (let i = 0; i < 5; i++) {
    const adapter = ctx.adapters[i];
    const legOverride = overrides.legs?.[i] || {};
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
      ...legOverride.legPerm,
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
      maxLegPerTx: legOverride.leg?.maxLegPerTx ?? strategyMaxTx,
      maxLegPerDay: ethers.parseUnits("10000", 6),
      ...legOverride.leg,
    });
  }
  await ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs);
  const strategyId = await ctx.strategyRegistry.strategyIdFor(
    ctx.user.address,
    ctx.chainId,
    ctx.tokens.usdc,
  );
  return { strategyId, poolIds: POOL_IDS, legs, legPermissionIds: legs.map((l) => l.legPermissionId) };
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

async function buildDepositLegs(ctx, grossUsdc = ethers.parseUnits("1000", 6), slippageBps = 500n) {
  const legBudget = grossUsdc / 5n;
  const half = legBudget / 2n;
  const netHalf = (half * 9900n) / 10000n;
  const deadline = BigInt((await time.latest()) + 3600);
  const legs = [];
  const emptySwap = {
    routeId: ethers.ZeroHash,
    grossUsdcIn: 0n,
    minOut: 0n,
    quotedOut: 0n,
    deadline: 0n,
  };

  for (let i = 0; i < 5; i++) {
    const adapter = ctx.adapters[i];
    const entry = POOL_CATALOGUE[i];
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
        swaps: [{ routeId: ROUTE_USDC_CBBTC, grossUsdcIn: half, minOut: q.minOut, quotedOut: q.expected, deadline }, emptySwap],
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
          { routeId: ROUTE_USDC_CBBTC, grossUsdcIn: half, minOut: qCb.minOut, quotedOut: qCb.expected, deadline },
          { routeId: ROUTE_USDC_WETH, grossUsdcIn: half, minOut: qWe.minOut, quotedOut: qWe.expected, deadline },
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

async function impersonateClExecutor(ctx) {
  const addr = await ctx.clExecutor.getAddress();
  await ethers.provider.send("hardhat_impersonateAccount", [addr]);
  await ethers.provider.send("hardhat_setBalance", [addr, ethers.toQuantity(ethers.parseEther("1"))]);
  return ethers.getSigner(addr);
}

async function mintLegPosition(ctx, legIndex = 0) {
  const adapter = ctx.adapters[legIndex];
  const clAddr = await ctx.clExecutor.getAddress();
  await ethers.provider.send("hardhat_impersonateAccount", [clAddr]);
  await ethers.provider.send("hardhat_setBalance", [clAddr, ethers.toQuantity(ethers.parseEther("1"))]);
  const clSigner = await ethers.getSigner(clAddr);
  const tokenAContract = adapter.tokenA === ctx.tokens.usdc ? ctx.usdc : adapter.tokenA === ctx.tokens.cbbtc ? ctx.cbbtc : ctx.weth;
  const tokenBContract = adapter.tokenB === ctx.tokens.usdc ? ctx.usdc : adapter.tokenB === ctx.tokens.cbbtc ? ctx.cbbtc : ctx.weth;
  const decA = adapter.tokenA === ctx.tokens.weth ? 18 : adapter.tokenA === ctx.tokens.cbbtc ? 8 : 6;
  const decB = adapter.tokenB === ctx.tokens.weth ? 18 : adapter.tokenB === ctx.tokens.cbbtc ? 8 : 6;
  const amountA = ethers.parseUnits("100", decA);
  const amountB = ethers.parseUnits("0.01", decB);
  await tokenAContract.mint(clAddr, amountA);
  await tokenBContract.mint(clAddr, amountB);
  await tokenAContract.connect(clSigner).approve(adapter.address, amountA);
  await tokenBContract.connect(clSigner).approve(adapter.address, amountB);
  await adapter.contract.connect(clSigner).mintPosition(
    ctx.user.address,
    adapter.tokenA,
    adapter.tokenB,
    -100000,
    -90000,
    amountA,
    amountB,
    1,
    1,
  );
  if (!mintLegPosition._seq) mintLegPosition._seq = new Map();
  const key = adapter.address.toLowerCase();
  const tokenId = BigInt((mintLegPosition._seq.get(key) ?? 0) + 1);
  mintLegPosition._seq.set(key, Number(tokenId));
  await adapter.contract.connect(ctx.user).approve(adapter.address, tokenId);
  return { adapter, tokenId };
}

async function approveUsdc(ctx, amount) {
  const permit2Addr = await ctx.permit2.getAddress();
  const clAddr = await ctx.clExecutor.getAddress();
  await ctx.usdc.connect(ctx.user).approve(permit2Addr, amount);
  await ctx.permit2
    .connect(ctx.user)
    .approve(ctx.tokens.usdc, clAddr, amount, BigInt((await time.latest()) + 3600));
}

async function deposit(ctx, strategyId, grossUsdc, executionNonce = 1n) {
  await approveUsdc(ctx, grossUsdc);
  return ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
    strategyId,
    executionNonce,
    grossUsdc,
    POOL_IDS,
    BigInt((await time.latest()) + 3600),
    await buildDepositLegs(ctx, grossUsdc),
  );
}

function exitParams(adapter, legIndex, tokenId, slippageBps = 100n) {
  return {
    legIndex,
    adapter: adapter.address,
    tokenA: adapter.tokenA,
    tokenB: adapter.tokenB,
    positionTokenId: tokenId,
    liquidity: 0n,
    amountAMin: 1n,
    amountBMin: 1n,
    slippageBps,
    fullExit: true,
  };
}

async function deployAutomationStack() {
  const [deployer, user, feeRecipient, keeper] = await ethers.getSigners();
  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const feeRouter = await ethers.deployContract("FeeRouter", [feeRecipient.address]);
  const oracleGuard = await ethers.deployContract("OracleGuard");
  const safetyController = await ethers.deployContract("SafetyController");
  const mevGuard = await ethers.deployContract("MevGuard");
  const automation = await ethers.deployContract("StableClubAutomationExecutor", [
    await permissionRegistry.getAddress(),
    await feeRouter.getAddress(),
    await oracleGuard.getAddress(),
    await safetyController.getAddress(),
    await mevGuard.getAddress(),
  ]);
  await permissionRegistry.setOperator(await automation.getAddress(), true);
  await feeRouter.wireExecutor(await automation.getAddress());
  await safetyController.wireExecutor(await automation.getAddress());
  await mevGuard.setOracle(await oracleGuard.getAddress());

  const usdcFeed = await ethers.deployContract("MockAggregatorV3", [1_00000000n]);
  const btcFeed = await ethers.deployContract("MockAggregatorV3", [100_00000000n]);
  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const cbbtc = await ethers.deployContract("MockERC20", ["Coinbase BTC", "cbBTC", 8]);
  await oracleGuard.configureFeed(await usdc.getAddress(), await usdcFeed.getAddress(), 3600, 8);
  await oracleGuard.configureFeed(await cbbtc.getAddress(), await btcFeed.getAddress(), 3600, 8);

  const clAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
    await automation.getAddress(),
    STEP2_POOL,
    "aerodrome-slipstream",
  ]);
  await automation.setAdapterApproval(await clAdapter.getAddress(), true);
  await automation.registerPool(STEP2_POOL, await clAdapter.getAddress(), true);
  await automation.setOfficialPoolCatalogue(STEP2_POOL, true);
  await automation.setTokenApproval(await usdc.getAddress(), true);
  await automation.setTokenApproval(await cbbtc.getAddress(), true);

  const signers = await ethers.getSigners();
  await activateStep2PoolWithGovernance({
    automation,
    permissionRegistry,
    feeRouter,
    oracleGuard,
    mevGuard,
    safetyController,
    openServGate: await ethers.deployContract("OpenServProposalGate"),
    poolId: STEP2_POOL,
    signers: signers.slice(0, 3),
  });

  await usdc.mint(user.address, ethers.parseUnits("100000", 6));
  await cbbtc.mint(user.address, ethers.parseUnits("10", 8));
  await usdc.mint(await clAdapter.getAddress(), ethers.parseUnits("100000", 6));
  await cbbtc.mint(await clAdapter.getAddress(), ethers.parseUnits("10", 8));

  return { user, keeper, permissionRegistry, automation, clAdapter, usdc, cbbtc, oracleGuard };
}

async function registerHarvestPerm(ctx, overrides = {}) {
  const perm = {
    user: ctx.user.address,
    chainId: (await ethers.provider.getNetwork()).chainId,
    poolId: STEP2_POOL,
    tokenA: await ctx.usdc.getAddress(),
    tokenB: await ctx.cbbtc.getAddress(),
    allowedActions: HARVEST_BIT | (1n << 7n),
    maxAmountPerTx: ethers.parseUnits("1", 6),
    maxAmountPerDay: ethers.parseUnits("1", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt: BigInt((await time.latest()) + 86400),
    revoked: false,
    paused: false,
    ...overrides,
  };
  await ctx.permissionRegistry.connect(ctx.user).registerPermission(perm);
  return ctx.permissionRegistry.permissionIdFor(
    perm.user,
    perm.chainId,
    perm.poolId,
    perm.tokenA,
    perm.tokenB,
  );
}

async function mintClPosition(ctx) {
  const automationAddr = await ctx.automation.getAddress();
  await ethers.provider.send("hardhat_impersonateAccount", [automationAddr]);
  await ethers.provider.send("hardhat_setBalance", [automationAddr, ethers.toQuantity(ethers.parseEther("1"))]);
  const automationSigner = await ethers.getSigner(automationAddr);
  await ctx.usdc.connect(ctx.user).transfer(automationAddr, ethers.parseUnits("200", 6));
  await ctx.cbbtc.connect(ctx.user).transfer(automationAddr, ethers.parseUnits("0.2", 8));
  await ctx.usdc.connect(automationSigner).approve(await ctx.clAdapter.getAddress(), ethers.parseUnits("200", 6));
  await ctx.cbbtc.connect(automationSigner).approve(await ctx.clAdapter.getAddress(), ethers.parseUnits("0.2", 8));
  await ctx.clAdapter.connect(automationSigner).mintPosition(
    ctx.user.address,
    await ctx.usdc.getAddress(),
    await ctx.cbbtc.getAddress(),
    -100000,
    -90000,
    ethers.parseUnits("200", 6),
    ethers.parseUnits("0.2", 8),
    1,
    1,
  );
  const tokenId = 1n;
  await ctx.clAdapter.connect(ctx.user).approve(await ctx.clAdapter.getAddress(), tokenId);
  return tokenId;
}

describe("Operation-path permission enforcement", function () {
  describe("deposit (StableClubConcentratedLiquidityExecutor.depositFivePoolStrategy)", function () {
    it("enforces strategy maxTotalPerTx at deposit intent consumption", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        strategy: { maxTotalPerTx: ethers.parseUnits("400", 6) },
      });
      const gross = ethers.parseUnits("500", 6);
      await expect(deposit(ctx, strategyId, gross)).to.be.revertedWithCustomError(
        ctx.strategyRegistry,
        "AmountExceedsStrategyTxLimit",
      );
    });

    it("enforces leg maxLegPerTx", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        legs: [{ leg: { maxLegPerTx: ethers.parseUnits("50", 6) } }],
      });
      await expect(deposit(ctx, strategyId, ethers.parseUnits("1000", 6))).to.be.revertedWithCustomError(
        ctx.strategyRegistry,
        "AmountExceedsLegTxLimit",
      );
    });

    it("enforces leg PermissionRegistry maxAmountPerTx with authoritative leg amount", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        legs: [{ legPerm: { maxAmountPerTx: ethers.parseUnits("50", 6) } }],
      });
      await expect(deposit(ctx, strategyId, ethers.parseUnits("1000", 6))).to.be.revertedWithCustomError(
        ctx.permissionRegistry,
        "AmountExceedsTxLimit",
      );
    });

    it("enforces allowed deposit action on leg permission", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        legs: [{ legPerm: { allowedActions: ALL_ACTIONS & ~DEPOSIT_BIT } }],
      });
      await expect(deposit(ctx, strategyId, ethers.parseUnits("500", 6))).to.be.revertedWithCustomError(
        ctx.permissionRegistry,
        "ActionNotAllowed",
      );
    });

    it("enforces strategy slippage cap on leg deposit", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, { strategy: { maxSlippageBps: 100n } });
      await approveUsdc(ctx, ethers.parseUnits("500", 6));
      await expect(
        ctx.clExecutor.connect(ctx.user).depositFivePoolStrategy(
          strategyId,
          1n,
          ethers.parseUnits("500", 6),
          POOL_IDS,
          BigInt((await time.latest()) + 3600),
          await buildDepositLegs(ctx, ethers.parseUnits("500", 6), 500n),
        ),
      ).to.be.revertedWithCustomError(ctx.strategyRegistry, "SlippageTooHigh");
    });

    it("enforces strategy minTimeBetweenExecutions via depositFivePoolStrategy", async function () {
      const ctx = await deployClStack();
      const gross = ethers.parseUnits("500", 6);
      const { strategyId } = await registerStrategy(ctx, {
        strategy: { minTimeBetweenExecutions: 3600n },
      });
      await deposit(ctx, strategyId, gross, 1n);
      await expect(deposit(ctx, strategyId, gross, 2n)).to.be.revertedWithCustomError(
        ctx.strategyRegistry,
        "ExecutionTooSoon",
      );
    });

    it("enforces strategy maxExecutionsPerDay via depositFivePoolStrategy", async function () {
      const ctx = await deployClStack();
      const gross = ethers.parseUnits("500", 6);
      const { strategyId } = await registerStrategy(ctx, { strategy: { maxExecutionsPerDay: 1n } });
      await deposit(ctx, strategyId, gross, 1n);
      await expect(deposit(ctx, strategyId, gross, 2n)).to.be.revertedWithCustomError(
        ctx.strategyRegistry,
        "DailyExecutionLimitReached",
      );
    });

    it("enforces strategy expiry", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        strategy: { expiresAt: BigInt((await time.latest()) + 10) },
      });
      await time.increase(11);
      await expect(deposit(ctx, strategyId, ethers.parseUnits("500", 6))).to.be.revertedWithCustomError(
        ctx.strategyRegistry,
        "StrategyExpired",
      );
    });

    it("enforces strategy maxTotalPerDay via depositFivePoolStrategy", async function () {
      const ctx = await deployClStack();
      const gross = ethers.parseUnits("500", 6);
      const { strategyId } = await registerStrategy(ctx, {
        strategy: { maxTotalPerDay: gross },
      });
      await deposit(ctx, strategyId, gross, 1n);
      await expect(deposit(ctx, strategyId, gross, 2n)).to.be.revertedWithCustomError(
        ctx.strategyRegistry,
        "AmountExceedsStrategyDailyLimit",
      );
    });

    it("enforces leg PermissionRegistry maxAmountPerDay on deposit path", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        legs: [{ legPerm: { maxAmountPerDay: ethers.parseUnits("100", 6) } }],
      });
      await deposit(ctx, strategyId, ethers.parseUnits("500", 6), 1n);
      await expect(deposit(ctx, strategyId, ethers.parseUnits("500", 6), 2n)).to.be.revertedWithCustomError(
        ctx.permissionRegistry,
        "AmountExceedsDailyLimit",
      );
    });

    it("enforces strategy user identity binding", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx);
      const signers = await ethers.getSigners();
      const attacker = signers[4];
      await approveUsdc(ctx, ethers.parseUnits("500", 6));
      await expect(
        ctx.clExecutor.connect(attacker).depositFivePoolStrategy(
          strategyId,
          1n,
          ethers.parseUnits("500", 6),
          POOL_IDS,
          BigInt((await time.latest()) + 3600),
          await buildDepositLegs(ctx, ethers.parseUnits("500", 6)),
        ),
      ).to.be.revertedWithCustomError(ctx.clExecutor, "StrategyUserMismatch");
    });
  });

  describe("exit (StableClubConcentratedLiquidityExecutor.exitLeg)", function () {
    it("passes amount=0 — leg tx/daily caps do not block full exit", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        legs: [{ legPerm: { maxAmountPerTx: 1n, maxAmountPerDay: 1n } }],
      });
      const { adapter, tokenId } = await mintLegPosition(ctx, 0);
      await ctx.clExecutor
        .connect(ctx.user)
        .exitLeg(strategyId, exitParams(adapter, 0, tokenId), 100n);
    });

    it("enforces withdraw-all action bit on leg permission", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        legs: [{ legPerm: { allowedActions: ALL_ACTIONS & ~WITHDRAW_ALL_BIT } }],
      });
      const { adapter, tokenId } = await mintLegPosition(ctx, 0);
      await expect(
        ctx.clExecutor.connect(ctx.user).exitLeg(strategyId, exitParams(adapter, 0, tokenId), 100n),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ActionNotAllowed");
    });

    it("enforces slippage cap on exit", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx);
      const { adapter, tokenId } = await mintLegPosition(ctx, 0);
      await expect(
        ctx.clExecutor.connect(ctx.user).exitLeg(strategyId, exitParams(adapter, 0, tokenId, 600n), 100n),
      ).to.be.revertedWithCustomError(ctx.strategyRegistry, "SlippageTooHigh");
    });

    it("enforces strategy user identity binding on exit", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx);
      const { adapter, tokenId } = await mintLegPosition(ctx, 0);
      const signers = await ethers.getSigners();
      const attacker = signers[4];
      await expect(
        ctx.clExecutor.connect(attacker).exitLeg(strategyId, exitParams(adapter, 0, tokenId), 100n),
      ).to.be.revertedWithCustomError(ctx.clExecutor, "StrategyUserMismatch");
    });

    it("enforces leg permission expiresAt on exitLeg", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        legs: [{ legPerm: { expiresAt: BigInt((await time.latest()) + 5) } }],
      });
      const { adapter, tokenId } = await mintLegPosition(ctx, 0);
      await time.increase(6);
      await expect(
        ctx.clExecutor.connect(ctx.user).exitLeg(strategyId, exitParams(adapter, 0, tokenId), 100n),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "PermissionExpired");
    });

    it("enforces leg permission maxExecutionsPerDay on exitLeg", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        legs: [{ legPerm: { maxExecutionsPerDay: 1n } }],
      });
      const { adapter, tokenId } = await mintLegPosition(ctx, 0);
      await ctx.clExecutor
        .connect(ctx.user)
        .exitLeg(strategyId, exitParams(adapter, 0, tokenId), 100n);
      const { tokenId: tokenId2 } = await mintLegPosition(ctx, 0);
      await expect(
        ctx.clExecutor.connect(ctx.user).exitLeg(strategyId, exitParams(adapter, 0, tokenId2), 101n),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "DailyExecutionLimitReached");
    });

    it("enforces leg permission minTimeBetweenExecutions on exitLeg", async function () {
      const ctx = await deployClStack();
      const { strategyId } = await registerStrategy(ctx, {
        legs: [{ legPerm: { minTimeBetweenExecutions: 3600n } }],
      });
      const { adapter, tokenId } = await mintLegPosition(ctx, 0);
      await ctx.clExecutor
        .connect(ctx.user)
        .exitLeg(strategyId, exitParams(adapter, 0, tokenId), 100n);
      const { tokenId: tokenId2 } = await mintLegPosition(ctx, 0);
      await expect(
        ctx.clExecutor.connect(ctx.user).exitLeg(strategyId, exitParams(adapter, 0, tokenId2), 101n),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ExecutionTooSoon");
    });
  });

  describe("harvest (StableClubAutomationExecutor.harvest)", function () {
    it("passes amount=0 — tx/daily caps do not block harvest", async function () {
      const ctx = await deployAutomationStack();
      const permissionId = await registerHarvestPerm(ctx);
      const tokenId = await mintClPosition(ctx);
      await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 0n);
      await ctx.automation.connect(ctx.user).harvest(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
      );
    });

    it("enforces harvest action bit", async function () {
      const ctx = await deployAutomationStack();
      const permissionId = await registerHarvestPerm(ctx, { allowedActions: 1n << 7n });
      const tokenId = await mintClPosition(ctx);
      await expect(
        ctx.automation.connect(ctx.user).harvest(
          permissionId,
          1n,
          await ctx.clAdapter.getAddress(),
          tokenId,
        ),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ActionNotAllowed");
    });

    it("enforces permission expiry", async function () {
      const ctx = await deployAutomationStack();
      const permissionId = await registerHarvestPerm(ctx, {
        expiresAt: BigInt((await time.latest()) + 5),
      });
      const tokenId = await mintClPosition(ctx);
      await time.increase(6);
      await expect(
        ctx.automation.connect(ctx.user).harvest(
          permissionId,
          1n,
          await ctx.clAdapter.getAddress(),
          tokenId,
        ),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "PermissionExpired");
    });

    it("enforces permission user identity binding", async function () {
      const ctx = await deployAutomationStack();
      const permissionId = await registerHarvestPerm(ctx);
      const tokenId = await mintClPosition(ctx);
      const signers = await ethers.getSigners();
      const attacker = signers[4];
      await expect(
        ctx.automation.connect(attacker).harvest(
          permissionId,
          1n,
          await ctx.clAdapter.getAddress(),
          tokenId,
        ),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "UnauthorizedUser");
    });

    it("enforces minTimeBetweenExecutions on harvest", async function () {
      const ctx = await deployAutomationStack();
      const permissionId = await registerHarvestPerm(ctx, { minTimeBetweenExecutions: 3600n });
      const tokenId = await mintClPosition(ctx);
      await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 0n);
      await ctx.automation.connect(ctx.user).harvest(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
      );
      await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 0n);
      await expect(
        ctx.automation.connect(ctx.user).harvest(
          permissionId,
          2n,
          await ctx.clAdapter.getAddress(),
          tokenId,
        ),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "ExecutionTooSoon");
    });

    it("enforces maxExecutionsPerDay on harvest", async function () {
      const ctx = await deployAutomationStack();
      const permissionId = await registerHarvestPerm(ctx, { maxExecutionsPerDay: 1n });
      const tokenId = await mintClPosition(ctx);
      await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 0n);
      await ctx.automation.connect(ctx.user).harvest(
        permissionId,
        1n,
        await ctx.clAdapter.getAddress(),
        tokenId,
      );
      await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 0n);
      await expect(
        ctx.automation.connect(ctx.user).harvest(
          permissionId,
          2n,
          await ctx.clAdapter.getAddress(),
          tokenId,
        ),
      ).to.be.revertedWithCustomError(ctx.permissionRegistry, "DailyExecutionLimitReached");
    });
  });

  describe("compound (StableClubAutomationExecutor.compound)", function () {
    it("enforces authoritative notional at validateExecution", async function () {
      const ctx = await deployAutomationStack();
      const perm = {
        user: ctx.user.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        poolId: STEP2_POOL,
        tokenA: await ctx.usdc.getAddress(),
        tokenB: await ctx.cbbtc.getAddress(),
        allowedActions: COMPOUND_BIT,
        maxAmountPerTx: ethers.parseUnits("1", 6),
        maxAmountPerDay: ethers.parseUnits("100", 6),
        maxSlippageBps: 500n,
        minTimeBetweenExecutions: 0n,
        maxExecutionsPerDay: 50n,
        expiresAt: BigInt((await time.latest()) + 86400),
        revoked: false,
        paused: false,
      };
      await ctx.permissionRegistry.connect(ctx.user).registerPermission(perm);
      const permissionId = await ctx.permissionRegistry.permissionIdFor(
        perm.user,
        perm.chainId,
        perm.poolId,
        perm.tokenA,
        perm.tokenB,
      );
      const tokenId = await mintClPosition(ctx);
      await ctx.clAdapter.setCollectFeeAmounts(ethers.parseUnits("10", 6), 1n);

      await expect(
        ctx.automation.connect(ctx.user).compound(
          permissionId,
          1n,
          await ctx.clAdapter.getAddress(),
          tokenId,
          await ctx.usdc.getAddress(),
          await ctx.usdc.getAddress(),
          await ctx.cbbtc.getAddress(),
          0n,
          0n,
          ethers.parseUnits("5", 6),
          0n,
          1n,
          0n,
          100n,
          BigInt((await time.latest()) + 3600),
          0n,
        ),
      ).to.be.reverted;
      expect(await ctx.permissionRegistry.executionNonceUsed(permissionId, 1n)).to.equal(false);
    });
  });

  describe("emergency (StableClubConcentratedLiquidityExecutor.emergencyExitLeg)", function () {
    it("validateEmergencyExecution ignores revoked/paused/expiry but enforces nonce identity", async function () {
      const ctx = await deployClStack();
      const { strategyId, legPermissionIds } = await registerStrategy(ctx, {
        legs: [{ legPerm: { expiresAt: BigInt((await time.latest()) + 5) } }],
      });
      const { adapter, tokenId } = await mintLegPosition(ctx, 0);
      await ctx.permissionRegistry.connect(ctx.user).revoke(legPermissionIds[0]);
      await ctx.permissionRegistry.connect(ctx.user).pause(legPermissionIds[0]);
      await time.increase(10);

      await ctx.clExecutor.connect(ctx.user).emergencyExitLeg(
        strategyId,
        exitParams(adapter, 0, tokenId),
        200n,
      );
      const domainNonce = await ctx.clExecutor.encodeExitExecutionNonce(200n);
      expect(await ctx.permissionRegistry.executionNonceUsed(legPermissionIds[0], domainNonce)).to.equal(
        true,
      );

      await expect(
        ctx.clExecutor.connect(ctx.user).emergencyExitLeg(
          strategyId,
          exitParams(adapter, 0, tokenId),
          200n,
        ),
      ).to.be.reverted;
    });
  });
});
