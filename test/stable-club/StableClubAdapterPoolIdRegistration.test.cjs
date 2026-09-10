/**
 * SC-08 — adapter.poolId() must match leg.poolId at strategy registration.
 * Focused Hardhat tests only (no deposit/exit/cascade coverage beyond residual deposit-time check presence).
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployClExecutor } = require("../../scripts/stable-club/deploy-cl-executor.cjs");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ALL_ACTIONS =
  (1n << 0n) | (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 6n) | (1n << 7n);

const STRATEGY_KIND = ethers.id("STABLE_CLUB_FIVE_POOL_V1");

const POOL_IDS = [
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL10"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100"),
  ethers.id("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_UNI_005"),
];

async function deployRegistrationStack() {
  const [deployer, user] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const cbbtc = await ethers.deployContract("MockERC20", ["Coinbase BTC", "cbBTC", 8]);
  const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);
  const tokens = {
    usdc: await usdc.getAddress(),
    cbbtc: await cbbtc.getAddress(),
    weth: await weth.getAddress(),
  };

  const permissionRegistry = await ethers.deployContract("PermissionRegistry");
  const strategyRegistry = await ethers.deployContract("StrategyPermissionRegistry", [
    await permissionRegistry.getAddress(),
    STRATEGY_KIND,
    tokens.usdc,
  ]);
  await permissionRegistry.setStrategyRegistrar(await strategyRegistry.getAddress(), true);

  // Minimal executor only so MockConcentratedLiquidityAdapter constructor is satisfied.
  const oracleGuard = await ethers.deployContract("OracleGuard");
  const mevGuard = await ethers.deployContract("MevGuard");
  await mevGuard.setOracle(await oracleGuard.getAddress());
  const feeRouter = await ethers.deployContract("FeeRouter", [deployer.address]);
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

  const pairKeys = [
    ["usdc", "cbbtc"],
    ["usdc", "cbbtc"],
    ["cbbtc", "weth"],
    ["cbbtc", "weth"],
    ["cbbtc", "weth"],
  ];
  const adapters = [];
  for (let i = 0; i < 5; i++) {
    const adapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      clExecutorAddr,
      POOL_IDS[i],
      "mock",
    ]);
    const adapterAddr = await adapter.getAddress();
    await clExecutor.setAdapterApproval(adapterAddr, true);
    await clExecutor.registerPool(POOL_IDS[i], adapterAddr);
    adapters.push({
      poolId: POOL_IDS[i],
      address: adapterAddr,
      contract: adapter,
      tokenA: tokens[pairKeys[i][0]],
      tokenB: tokens[pairKeys[i][1]],
    });
  }

  return {
    deployer,
    user,
    chainId,
    permissionRegistry,
    strategyRegistry,
    clExecutor,
    clExecutorAddr,
    tokens,
    adapters,
  };
}

async function buildRegistration(ctx, { adapterOverrides = [] } = {}) {
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
    const base = ctx.adapters[i];
    const override = adapterOverrides[i] || {};
    const poolId = override.poolId ?? base.poolId;
    const adapterAddr = override.adapter ?? base.address;
    const tokenA = override.tokenA ?? base.tokenA;
    const tokenB = override.tokenB ?? base.tokenB;

    const legPerm = {
      user: ctx.user.address,
      chainId: ctx.chainId,
      poolId,
      tokenA,
      tokenB,
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
      poolId,
      allocationBps: 2000n,
      adapter: adapterAddr,
      tokenA,
      tokenB,
      legPermissionId,
      maxLegPerTx: ethers.parseUnits("2000", 6),
      maxLegPerDay: ethers.parseUnits("10000", 6),
    });
  }
  return { strategy, legPermissions, legs };
}

describe("SC-08 — adapter poolId at strategy registration", function () {
  it("correct adapter/poolId registers", async function () {
    const ctx = await deployRegistrationStack();
    const { strategy, legPermissions, legs } = await buildRegistration(ctx);
    const strategyId = await ctx.strategyRegistry.strategyIdFor(
      ctx.user.address,
      ctx.chainId,
      ctx.tokens.usdc,
    );

    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.emit(ctx.strategyRegistry, "StrategyRegistered");

    const stored = await ctx.strategyRegistry.getStrategy(strategyId);
    expect(stored.user).to.equal(ctx.user.address);
    for (let i = 0; i < 5; i++) {
      const leg = await ctx.strategyRegistry.getLeg(strategyId, i);
      expect(leg.poolId).to.equal(ctx.adapters[i].poolId);
      expect(leg.adapter).to.equal(ctx.adapters[i].address);
      const onChain = await ctx.adapters[i].contract.poolId();
      expect(onChain).to.equal(leg.poolId);
      const bound = await ctx.permissionRegistry.permissionStrategyId(leg.legPermissionId);
      expect(bound).to.equal(strategyId);
    }
  });

  it("wrong poolId reverts", async function () {
    const ctx = await deployRegistrationStack();
    const wrongAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      ctx.clExecutorAddr,
      ethers.id("WRONG_ADAPTER_POOL"),
      "mock",
    ]);
    const { strategy, legPermissions, legs } = await buildRegistration(ctx, {
      adapterOverrides: [
        {
          // Keep registered leg poolId as catalogue[0], but point adapter at wrong poolId().
          poolId: ctx.adapters[0].poolId,
          adapter: await wrongAdapter.getAddress(),
          tokenA: ctx.adapters[0].tokenA,
          tokenB: ctx.adapters[0].tokenB,
        },
      ],
    });

    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "AdapterPoolIdMismatch");
  });

  it("adapter poolId call failure reverts", async function () {
    const ctx = await deployRegistrationStack();
    const eoaAdapter = ethers.Wallet.createRandom().address;
    const { strategy, legPermissions, legs } = await buildRegistration(ctx, {
      adapterOverrides: [
        {
          poolId: ctx.adapters[0].poolId,
          adapter: eoaAdapter,
          tokenA: ctx.adapters[0].tokenA,
          tokenB: ctx.adapters[0].tokenB,
        },
      ],
    });

    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.reverted;
  });

  it("zero adapter reverts with InvalidAdapter", async function () {
    const ctx = await deployRegistrationStack();
    const { strategy, legPermissions, legs } = await buildRegistration(ctx, {
      adapterOverrides: [
        {
          poolId: ctx.adapters[0].poolId,
          adapter: ethers.ZeroAddress,
          tokenA: ctx.adapters[0].tokenA,
          tokenB: ctx.adapters[0].tokenB,
        },
      ],
    });

    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "InvalidAdapter");
  });

  it("failed registration leaves no partial state", async function () {
    const ctx = await deployRegistrationStack();
    const wrongAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      ctx.clExecutorAddr,
      ethers.id("PARTIAL_STATE_WRONG"),
      "mock",
    ]);
    // Fail on last leg so earlier loop iterations would have registered if not atomic.
    const overrides = [];
    for (let i = 0; i < 4; i++) overrides.push({});
    overrides.push({
      poolId: ctx.adapters[4].poolId,
      adapter: await wrongAdapter.getAddress(),
      tokenA: ctx.adapters[4].tokenA,
      tokenB: ctx.adapters[4].tokenB,
    });

    const { strategy, legPermissions, legs } = await buildRegistration(ctx, {
      adapterOverrides: overrides,
    });
    const strategyId = await ctx.strategyRegistry.strategyIdFor(
      ctx.user.address,
      ctx.chainId,
      ctx.tokens.usdc,
    );

    await expect(
      ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs),
    ).to.be.revertedWithCustomError(ctx.strategyRegistry, "AdapterPoolIdMismatch");

    const stored = await ctx.strategyRegistry.getStrategy(strategyId);
    expect(stored.user).to.equal(ethers.ZeroAddress);

    for (let i = 0; i < 5; i++) {
      const expectedId = await ctx.permissionRegistry.permissionIdFor(
        ctx.user.address,
        ctx.chainId,
        ctx.adapters[i].poolId,
        ctx.adapters[i].tokenA,
        ctx.adapters[i].tokenB,
      );
      const perm = await ctx.permissionRegistry.getPermission(expectedId);
      expect(perm.user).to.equal(ethers.ZeroAddress);
      expect(await ctx.permissionRegistry.permissionStrategyId(expectedId)).to.equal(
        ethers.ZeroHash,
      );
    }
  });

  it("existing deposit-time poolId check remains unchanged", async function () {
    // Defense-in-depth on the executor must still reject adapter/pool mismatch at deposit.
    const ctx = await deployRegistrationStack();
    const { strategy, legPermissions, legs } = await buildRegistration(ctx);
    await ctx.strategyRegistry.connect(ctx.user).registerFivePoolStrategy(strategy, legPermissions, legs);

    const wrongAdapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      ctx.clExecutorAddr,
      ethers.id("DEPOSIT_TIME_WRONG"),
      "mock",
    ]);
    await ctx.clExecutor.setAdapterApproval(await wrongAdapter.getAddress(), true);

    // registerPool itself still enforces adapter.poolId() == poolId (unchanged deposit-path guard).
    await expect(
      ctx.clExecutor.registerPool(ctx.adapters[0].poolId, await wrongAdapter.getAddress()),
    ).to.be.revertedWithCustomError(ctx.clExecutor, "PoolMismatch");
  });
});
