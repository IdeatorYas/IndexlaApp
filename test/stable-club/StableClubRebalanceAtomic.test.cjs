const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const REBALANCE_ACTION = 1n << 10n;
const POOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
);

async function deployRebalanceStack() {
  const [deployer, user, feeRecipient, stranger] = await ethers.getSigners();
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
    POOL_ID,
    "aerodrome-slipstream",
  ]);
  await automation.setAdapterApproval(await clAdapter.getAddress(), true);
  await automation.registerPool(POOL_ID, await clAdapter.getAddress(), true);
  await automation.setOfficialPoolCatalogue(POOL_ID, true);
  await automation.activateOfficialPool(POOL_ID);
  await automation.setTokenApproval(await usdc.getAddress(), true);
  await automation.setTokenApproval(await cbbtc.getAddress(), true);

  await usdc.mint(user.address, ethers.parseUnits("100000", 6));
  await cbbtc.mint(user.address, ethers.parseUnits("10", 8));
  await usdc.mint(await clAdapter.getAddress(), ethers.parseUnits("100000", 6));
  await cbbtc.mint(await clAdapter.getAddress(), ethers.parseUnits("10", 8));

  return {
    deployer,
    user,
    feeRecipient,
    stranger,
    permissionRegistry,
    feeRouter,
    oracleGuard,
    safetyController,
    mevGuard,
    automation,
    clAdapter,
    usdc,
    cbbtc,
  };
}

async function registerRebalancePermission(ctx, overrides = {}) {
  const permission = {
    user: ctx.user.address,
    chainId: (await ethers.provider.getNetwork()).chainId,
    poolId: POOL_ID,
    tokenA: await ctx.usdc.getAddress(),
    tokenB: await ctx.cbbtc.getAddress(),
    allowedActions: REBALANCE_ACTION,
    maxAmountPerTx: ethers.parseUnits("50000", 6),
    maxAmountPerDay: ethers.parseUnits("200000", 6),
    maxSlippageBps: 500n,
    minTimeBetweenExecutions: 0n,
    maxExecutionsPerDay: 50n,
    expiresAt: BigInt((await time.latest()) + 86400 * 7),
    revoked: false,
    paused: false,
    ...overrides,
  };
  await ctx.permissionRegistry.connect(ctx.user).registerPermission(permission);
  return ctx.permissionRegistry.permissionIdFor(
    permission.user,
    permission.chainId,
    permission.poolId,
    permission.tokenA,
    permission.tokenB,
  );
}

async function mintPositionViaExecutor(
  ctx,
  amountA = ethers.parseUnits("200", 6),
  amountB = ethers.parseUnits("0.2", 8),
  { approveAdapter = true } = {},
) {
  const executor = await ctx.automation.getAddress();
  await ethers.provider.send("hardhat_impersonateAccount", [executor]);
  await ethers.provider.send("hardhat_setBalance", [
    executor,
    ethers.toQuantity(ethers.parseEther("1")),
  ]);
  const executorSigner = await ethers.getSigner(executor);
  await ctx.usdc.connect(ctx.user).transfer(executor, amountA);
  await ctx.cbbtc.connect(ctx.user).transfer(executor, amountB);
  await ctx.usdc.connect(executorSigner).approve(await ctx.clAdapter.getAddress(), amountA);
  await ctx.cbbtc.connect(executorSigner).approve(await ctx.clAdapter.getAddress(), amountB);
  await ctx.clAdapter.connect(executorSigner).mintPosition(
    ctx.user.address,
    await ctx.usdc.getAddress(),
    await ctx.cbbtc.getAddress(),
    -100000,
    -90000,
    amountA,
    amountB,
    amountA > 0n ? 1n : 0n,
    amountB > 0n ? 1n : 0n,
  );
  const tokenId = 1n;
  if (approveAdapter) {
    await ctx.clAdapter.connect(ctx.user).approve(await ctx.clAdapter.getAddress(), tokenId);
  }
  return { tokenId, executorSigner };
}

async function rebalance(ctx, permissionId, overrides = {}) {
  const params = {
    executionNonce: 1n,
    tokenId: 1n,
    newTickLower: -90000,
    newTickUpper: -80000,
    swapAmount: 0n,
    minAmountOut: 0n,
    closeAmountAMin: 1n,
    closeAmountBMin: 1n,
    mintAmountAMin: 1n,
    mintAmountBMin: 1n,
    slippageBps: 150n,
    deadline: BigInt((await time.latest()) + 600),
    quotedAmountOut: 0n,
    ...overrides,
  };
  return ctx.automation.connect(ctx.user).rebalance(
    permissionId,
    params.executionNonce,
    await ctx.clAdapter.getAddress(),
    params.tokenId,
    await ctx.usdc.getAddress(),
    await ctx.cbbtc.getAddress(),
    params.newTickLower,
    params.newTickUpper,
    params.swapAmount,
    params.minAmountOut,
    params.closeAmountAMin,
    params.closeAmountBMin,
    params.mintAmountAMin,
    params.mintAmountBMin,
    params.slippageBps,
    params.deadline,
    params.quotedAmountOut,
  );
}

describe("Stable Club — atomic rebalance accounting", function () {
  it("never pulls from user wallet — succeeds with zero ERC20 approvals", async function () {
    const ctx = await deployRebalanceStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);

    expect(await ctx.usdc.allowance(ctx.user.address, await ctx.automation.getAddress())).to.equal(0n);
    expect(await ctx.cbbtc.allowance(ctx.user.address, await ctx.automation.getAddress())).to.equal(0n);
    expect(await ctx.usdc.allowance(ctx.user.address, await ctx.feeRouter.getAddress())).to.equal(0n);

    await rebalance(ctx, permissionId);

    expect(await ctx.usdc.allowance(ctx.user.address, await ctx.automation.getAddress())).to.equal(0n);
    expect(await ctx.cbbtc.allowance(ctx.user.address, await ctx.automation.getAddress())).to.equal(0n);
    expect(await ctx.clAdapter.ownerOf(2n)).to.equal(ctx.user.address);
  });

  it("reverts when swapAmount exceeds the closed and collected balance delta", async function () {
    const ctx = await deployRebalanceStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));
    await ctx.clAdapter.setCollectFeeAmounts(1_000_000n, 1_000_000n);

    await expect(
      rebalance(ctx, permissionId, {
        swapAmount: ethers.parseUnits("1000000", 6),
        minAmountOut: 1n,
        quotedAmountOut: 1n,
      }),
    ).to.be.revertedWithCustomError(ctx.automation, "ExceedsCollectedFees");
    expect(await ctx.permissionRegistry.executionNonceUsed(permissionId, 1n)).to.equal(false);
  });

  it("enforces oracle-normalized tx limit on full position value even with a tiny swap", async function () {
    const ctx = await deployRebalanceStack();
    const permissionId = await registerRebalancePermission(ctx, {
      maxAmountPerTx: ethers.parseUnits("5", 6),
    });
    await mintPositionViaExecutor(ctx, ethers.parseUnits("50", 6), ethers.parseUnits("0.05", 8));

    const swapAmount = ethers.parseUnits("1", 6);
    const net = (swapAmount * 99n) / 100n;
    const expected = await ctx.oracleGuard.expectedAmountOut(
      await ctx.usdc.getAddress(),
      await ctx.cbbtc.getAddress(),
      net,
      6,
      8,
    );
    await expect(
      rebalance(ctx, permissionId, {
        swapAmount,
        minAmountOut: expected,
        quotedAmountOut: expected,
      }),
    ).to.be.revertedWithCustomError(ctx.permissionRegistry, "AmountExceedsTxLimit");
  });

  it("refunds mint dust and restores pre-call executor balances", async function () {
    const ctx = await deployRebalanceStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);
    await ctx.clAdapter.setCollectFeeAmounts(3_000_000n, 2_000_000n);
    await ctx.clAdapter.setDustLeaveBps(500n);

    const executor = await ctx.automation.getAddress();
    await ctx.usdc.mint(executor, ethers.parseUnits("7", 6));
    const preUsdc = await ctx.usdc.balanceOf(executor);
    const preBtc = await ctx.cbbtc.balanceOf(executor);
    const userUsdcBefore = await ctx.usdc.balanceOf(ctx.user.address);

    await rebalance(ctx, permissionId);

    expect(await ctx.usdc.balanceOf(executor)).to.equal(preUsdc);
    expect(await ctx.cbbtc.balanceOf(executor)).to.equal(preBtc);
    expect(await ctx.usdc.balanceOf(ctx.user.address)).to.be.gt(userUsdcBefore);
  });

  it("rolls back nonce when rebalance reverts after validation", async function () {
    const ctx = await deployRebalanceStack();
    const permissionId = await registerRebalancePermission(ctx);
    await mintPositionViaExecutor(ctx);

    const swapAmount = ethers.parseUnits("1", 6);
    const net = (swapAmount * 99n) / 100n;
    const expected = await ctx.oracleGuard.expectedAmountOut(
      await ctx.usdc.getAddress(),
      await ctx.cbbtc.getAddress(),
      net,
      6,
      8,
    );
    await expect(
      rebalance(ctx, permissionId, {
        executionNonce: 7n,
        swapAmount,
        minAmountOut: expected + 1n,
        quotedAmountOut: expected + 1n,
      }),
    ).to.be.revertedWith("slip");

    expect(await ctx.permissionRegistry.executionNonceUsed(permissionId, 7n)).to.equal(false);
    expect(await ctx.permissionRegistry.dailySpent(permissionId)).to.equal(0n);
  });

  it("rejects a close recipient other than the LP owner or executor", async function () {
    const ctx = await deployRebalanceStack();
    const { tokenId, executorSigner } = await mintPositionViaExecutor(ctx);

    await expect(
      ctx.clAdapter.connect(executorSigner).closePosition(
        ctx.user.address,
        tokenId,
        ctx.stranger.address,
        await ctx.usdc.getAddress(),
        await ctx.cbbtc.getAddress(),
        1n,
        1n,
      ),
    ).to.be.revertedWithCustomError(ctx.clAdapter, "InvalidCloseRecipient");
  });
});
