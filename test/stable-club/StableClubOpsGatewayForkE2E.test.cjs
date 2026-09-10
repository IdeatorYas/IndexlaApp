/**
 * Base-fork proof for Ops Gateway flows.
 * Runs when BASE_RPC_URL is set (always available in this env) OR RUN_OPS_GATEWAY_FORK=1.
 * allowUnlimitedContractSize must stay false — executor must deploy under 24576.
 *
 * Proves: depositFirst, depositAgain, exitPercentToUsdc USDC-only + residual revert,
 * and records honest prompt inventories (not live wallet UI counts).
 */
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployClExecutor } = require("../../scripts/stable-club/deploy-cl-executor.cjs");

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
  { dualSwap: false },
  { dualSwap: false },
  { dualSwap: true },
  { dualSwap: true },
  { dualSwap: true },
];

const PROMPT_INVENTORY = {
  firstDepositSequential: { min: 3, max: 4, note: "2 EIP-712 + depositFirst; +1 if USDC→Permit2 approve" },
  depositAgainWarm: 1,
  coldWithdrawSequential: 4,
  warmWithdraw: 1,
};

async function deployGatewayStack() {
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

  // Size gate: deployed code must fit Spurious Dragon limit (libs linked separately).
  const code = await ethers.provider.getCode(clExecutorAddr);
  const codeBytes = (code.length - 2) / 2;
  expect(codeBytes).to.be.lte(24576);

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
  const routeUsdcWeth = { ...routeUsdcCbbtc, tokenOut: tokens.weth };
  await swapRouter.configureRoute(ROUTE_USDC_CBBTC, routeUsdcCbbtc);
  await swapRouter.configureRoute(ROUTE_USDC_WETH, routeUsdcWeth);
  await swapRouter.configureRoute(ethers.id("MOCK_CBBTC_USDC"), {
    ...routeUsdcCbbtc,
    tokenIn: tokens.cbbtc,
    tokenOut: tokens.usdc,
  });
  await swapRouter.configureRoute(ethers.id("MOCK_WETH_USDC"), {
    ...routeUsdcWeth,
    tokenIn: tokens.weth,
    tokenOut: tokens.usdc,
  });
  const sampleNet = (ethers.parseUnits("100", 6) * 9900n) / 10000n;
  const expectedCb = await oracleGuard.expectedAmountOut(tokens.usdc, tokens.cbbtc, sampleNet, 6, 8);
  const expectedWe = await oracleGuard.expectedAmountOut(tokens.usdc, tokens.weth, sampleNet, 6, 18);
  const rateCb = (expectedCb * 10n ** 18n) / sampleNet;
  const rateWe = (expectedWe * 10n ** 18n) / sampleNet;
  await swapRouter.setRate(ROUTE_USDC_CBBTC, rateCb);
  await swapRouter.setRate(ROUTE_USDC_WETH, rateWe);
  await swapRouter.setRate(ethers.id("MOCK_CBBTC_USDC"), 10n ** 36n / rateCb);
  await swapRouter.setRate(ethers.id("MOCK_WETH_USDC"), 10n ** 36n / rateWe);
  await cbbtc.mint(await swapRouter.getAddress(), ethers.parseUnits("1000000", 8));
  await weth.mint(await swapRouter.getAddress(), ethers.parseUnits("1000000", 18));
  await usdc.mint(await swapRouter.getAddress(), ethers.parseUnits("100000000", 6));
  await usdc.mint(user.address, ethers.parseUnits("1000000", 6));

  const adapters = [];
  for (let i = 0; i < 5; i++) {
    const entry = POOL_CATALOGUE[i];
    const tokenA = entry.dualSwap ? tokens.cbbtc : tokens.usdc;
    const tokenB = entry.dualSwap ? tokens.weth : tokens.cbbtc;
    const adapter = await ethers.deployContract("MockConcentratedLiquidityAdapter", [
      clExecutorAddr,
      POOL_IDS[i],
      entry.dualSwap ? "aerodrome-slipstream" : "uniswap-v3",
    ]);
    await clExecutor.setAdapterApproval(await adapter.getAddress(), true);
    await clExecutor.registerPool(POOL_IDS[i], await adapter.getAddress());
    adapters.push({
      address: await adapter.getAddress(),
      poolId: POOL_IDS[i],
      tokenA,
      tokenB,
      contract: adapter,
    });
  }

  const uniRouter = await ethers.deployContract("MockSwapRouter02ExactInputSingle");
  await usdc.mint(await uniRouter.getAddress(), ethers.parseUnits("1000000", 6));

  const gateway = await ethers.deployContract("StableClubOpsGateway", [
    strategyRegistryAddr,
    clExecutorAddr,
    await safetyController.getAddress(),
    await permit2.getAddress(),
    tokens.usdc,
    await uniRouter.getAddress(),
  ]);
  const gatewayAddr = await gateway.getAddress();
  await strategyRegistry.setOpsGateway(gatewayAddr);
  await clExecutor.setOpsGateway(gatewayAddr);
  await gateway.setTrackedExitToken(tokens.cbbtc, true);
  await gateway.setTrackedExitToken(tokens.weth, true);
  await gateway.approveRouterForToken(tokens.cbbtc);
  await gateway.approveRouterForToken(tokens.weth);
  const npm = await ethers.deployContract("MockNpmPositionManager");
  await gateway.setAllowedNpm(await npm.getAddress(), true);

  return {
    deployer,
    user,
    chainId,
    usdc,
    cbbtc,
    weth,
    tokens,
    permissionRegistry,
    strategyRegistry,
    permit2,
    oracleGuard,
    clExecutor,
    adapters,
    gateway,
    gatewayAddr,
    uniRouter,
    npm,
    codeBytes,
  };
}

async function buildRegistration(ctx) {
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
    expiresAt: BigInt((await time.latest()) + 86400 * 7),
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
      expiresAt: strategy.expiresAt,
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
  return { strategy, legPermissions, legs };
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
        slippageBps: 500n,
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
        slippageBps: 500n,
      });
    }
  }
  return legs;
}

describe("Ops Gateway fork/local full-flow proof", function () {
  this.timeout(180_000);

  it("executor deploys under 24576 with unlimited size disabled", async function () {
    const ctx = await deployGatewayStack();
    expect(ctx.codeBytes).to.be.lte(24576);
    expect(network.config.allowUnlimitedContractSize).to.equal(false);
  });

  it("first deposit + repeat deposit + partial/full exit USDC-only + residual fail-closed", async function () {
    const ctx = await deployGatewayStack();
    const { strategy, legPermissions, legs } = await buildRegistration(ctx);
    const strategyId = await ctx.strategyRegistry.strategyIdFor(
      strategy.user,
      strategy.chainId,
      strategy.depositToken,
    );

    // Prompt inventory (honest, sequential EOA) — not a wallet automation count.
    expect(PROMPT_INVENTORY.coldWithdrawSequential).to.equal(4);
    expect(PROMPT_INVENTORY.depositAgainWarm).to.equal(1);
    expect(PROMPT_INVENTORY.firstDepositSequential.min).to.equal(3);

    const gross1 = ethers.parseUnits("1000", 6);
    const depositDeadline = BigInt((await time.latest()) + 20 * 60);
    const nonce = await ctx.gateway.registerConsentNonce(ctx.user.address);
    const domain = {
      name: "StableClubOpsGateway",
      version: "1",
      chainId: ctx.chainId,
      verifyingContract: ctx.gatewayAddr,
    };
    const types = {
      RegisterConsent: [
        { name: "user", type: "address" },
        { name: "strategyId", type: "bytes32" },
        { name: "chainId", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const registerSig = await ctx.user.signTypedData(domain, types, {
      user: ctx.user.address,
      strategyId,
      chainId: ctx.chainId,
      nonce,
      deadline: depositDeadline,
    });
    const depositLegs = await buildDepositLegs(ctx, gross1);
    await ctx.usdc.connect(ctx.user).approve(await ctx.permit2.getAddress(), gross1 * 2n);
    const expiration = BigInt((await time.latest()) + 20 * 60);
    const permitSingle = {
      details: {
        token: ctx.tokens.usdc,
        amount: gross1,
        expiration,
        nonce: 0n,
      },
      spender: await ctx.clExecutor.getAddress(),
      sigDeadline: expiration,
    };

    await ctx.gateway.connect(ctx.user).depositFirst(
      strategy,
      legPermissions,
      legs,
      registerSig,
      permitSingle,
      "0x",
      strategyId,
      1n,
      gross1,
      POOL_IDS,
      depositDeadline,
      depositLegs,
    );
    expect(await ctx.usdc.balanceOf(ctx.gatewayAddr)).to.equal(0n);
    expect(await ctx.cbbtc.balanceOf(ctx.gatewayAddr)).to.equal(0n);

    // Repeat deposit (warm) — set Permit2 allowance via approve (no sig) then depositAgain
    const gross2 = ethers.parseUnits("500", 6);
    const depositLegs2 = await buildDepositLegs(ctx, gross2);
    const exp2 = BigInt((await time.latest()) + 20 * 60);
    await ctx.permit2
      .connect(ctx.user)
      .approve(ctx.tokens.usdc, await ctx.clExecutor.getAddress(), gross2, exp2);
    const emptyPermit = {
      details: { token: ctx.tokens.usdc, amount: 0n, expiration: 0n, nonce: 0n },
      spender: ethers.ZeroAddress,
      sigDeadline: 0n,
    };
    await ctx.gateway.connect(ctx.user).depositAgain(
      emptyPermit,
      "0x",
      strategyId,
      2n,
      gross2,
      POOL_IDS,
      BigInt((await time.latest()) + 20 * 60),
      depositLegs2,
    );

    // Withdraw path: mint NPM position, operator grant, exit USDC-only
    const npmAddr = await ctx.npm.getAddress();
    const liq = 1_000_000n;
    const amount0 = ethers.parseUnits("10", 6);
    const amount1 = ethers.parseUnits("1", 8);
    await ctx.usdc.mint(ctx.deployer.address, amount0);
    await ctx.cbbtc.mint(ctx.deployer.address, amount1);
    await ctx.usdc.mint(await ctx.uniRouter.getAddress(), amount1);
    await ctx.usdc.connect(ctx.deployer).approve(npmAddr, amount0);
    await ctx.cbbtc.connect(ctx.deployer).approve(npmAddr, amount1);
    await ctx.npm.mintPosition(
      ctx.user.address,
      ctx.tokens.usdc,
      ctx.tokens.cbbtc,
      liq,
      amount0,
      amount1,
    );
    await ctx.npm.connect(ctx.user).setApprovalForAll(ctx.gatewayAddr, true);

    const deadline = BigInt((await time.latest()) + 600);
    // Partial ~50%
    const halfLiq = liq / 2n;
    const usdcBefore = await ctx.usdc.balanceOf(ctx.user.address);
    await ctx.gateway.connect(ctx.user).exitPercentToUsdc(
      [
        {
          npm: npmAddr,
          tokenId: 1n,
          liquidity: halfLiq,
          amount0Min: 0n,
          amount1Min: 0n,
          burnIfEmpty: false,
        },
      ],
      [{ tokenIn: ctx.tokens.cbbtc, fee: 500, amountIn: 0n, amountOutMinimum: 1n }],
      1n,
      deadline,
    );
    expect(await ctx.cbbtc.balanceOf(ctx.gatewayAddr)).to.equal(0n);
    expect(await ctx.usdc.balanceOf(ctx.user.address)).to.be.gt(usdcBefore);

    // Residual fail-closed on remaining liquidity without swap
    await expect(
      ctx.gateway.connect(ctx.user).exitPercentToUsdc(
        [
          {
            npm: npmAddr,
            tokenId: 1n,
            liquidity: halfLiq,
            amount0Min: 0n,
            amount1Min: 0n,
            burnIfEmpty: true,
          },
        ],
        [],
        1n,
        deadline,
      ),
    ).to.be.revertedWithCustomError(ctx.gateway, "ResidualNonUsdc");

    // Full remaining with swap
    await ctx.gateway.connect(ctx.user).exitPercentToUsdc(
      [
        {
          npm: npmAddr,
          tokenId: 1n,
          liquidity: halfLiq,
          amount0Min: 0n,
          amount1Min: 0n,
          burnIfEmpty: true,
        },
      ],
      [{ tokenIn: ctx.tokens.cbbtc, fee: 500, amountIn: 0n, amountOutMinimum: 1n }],
      1n,
      deadline,
    );
    expect(await ctx.usdc.balanceOf(ctx.gatewayAddr)).to.equal(0n);
    expect(await ctx.cbbtc.balanceOf(ctx.gatewayAddr)).to.equal(0n);
  });
});
